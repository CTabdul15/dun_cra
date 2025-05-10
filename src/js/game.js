import supabase from './supabase-client.js'

class Room {
    constructor(color) {
        this.color = color;
        this.connections = {};
        this.discovered = false;
        this.x = 0;  // Map coordinates
        this.y = 0;
        this.monsters = [];
        this.upgradeUsed = false; // Track if upgrade has been used

        if (color === 'red') {
            // Number of monsters will be determined by Game.addMonstersToRoom()
        }
    }

    connect(direction, otherRoom) {
        this.connections[direction] = otherRoom;
    }

    isPurpleWithTrapdoor() {
        return this.color === 'purple';
    }
}


class Game {
    constructor() {
        // if (!window.supabase) {
        //     console.error('Supabase nicht geladen!');
        //     return;
        // }

        // this.supabase = window.supabase;
        this.setupRealtime();
        this.loadLeaderboard();
        this.level = 1;
        this.playerHealth = 3;
        this.playerDamage = 1;
        this.maxHealth = 8; // Maximum health cap
        this.maxDamage = 5; // Maximum damage cap
        this.revealTrapdoor = false;
        this.combatMode = false;
        this.inUpgradeMode = false;
        this.visitedRooms = new Set();
        this.allRooms = []; // Store all rooms for the current level
        this.gameOver = false; // Track if game is over
        this.hardMode = false; // Track if hard mode is enabled

        // Initialize the map
        this.mapSize = 9;
        this.mapCenter = Math.floor(this.mapSize / 2);

        // Load leaderboards (normal and hard mode)
        this.normalLeaderboard = this.loadLeaderboard('normal');
        this.hardLeaderboard = this.loadLeaderboard('hard');
        this.currentLeaderboard = 'normal'; // Default to normal leaderboard
        // this.displayLeaderboard();

        this.currentRoom = this.generateLevel();
        this.currentRoom.discovered = true;
        this.visitedRooms.add(this.currentRoom);

        this.logMessage(`You are on level ${this.level}. You start in a ${this.currentRoom.color} room.`);
        this.updateRoomDisplay();
        this.updateStatsDisplay();
        this.initializeMap();
        this.updateMap();
        this.updateButtonStates();

        // Initialize hard mode toggle
        this.initHardModeToggle();

        // Initialize leaderboard toggle
        this.initLeaderboardToggle();
    }
    initHardModeToggle() {
        const hardModeToggle = document.getElementById('hardModeToggle');
        const hardModeStatus = document.getElementById('hardModeStatus');
        const gameDisplay = document.getElementById('gameDisplay');

        hardModeToggle.checked = this.hardMode;
        hardModeStatus.textContent = this.hardMode ? 'On' : 'Off';
        hardModeStatus.className = this.hardMode ? 'toggle-label hardmode-enabled' : 'toggle-label';

        hardModeToggle.addEventListener('change', (e) => {
            if (this.level > 1 || this.combatMode || this.inUpgradeMode) {
                // Don't allow toggling after starting the game
                this.logMessage("You can only change difficulty before starting a new game!", "red");
                hardModeToggle.checked = this.hardMode; // Revert the toggle
                return;
            }

            this.hardMode = e.target.checked;
            hardModeStatus.textContent = this.hardMode ? 'On' : 'Off';
            hardModeStatus.className = this.hardMode ? 'toggle-label hardmode-enabled' : 'toggle-label';

            if (this.hardMode) {
                this.logMessage("Hard Mode activated! Monsters will be stronger and health upgrades less effective.", "red");
            } else {
                this.logMessage("Hard Mode deactivated. Standard difficulty applied.");
            }
            this.restartGame()
        });
    }
    getPlayerId() {
        let playerId = localStorage.getItem('playerId');
        if (!playerId) {
            playerId = crypto.randomUUID();
            localStorage.setItem('playerId', playerId);
        }
        return playerId;
    }
    initLeaderboardToggle() {
        const normalLeaderboardBtn = document.getElementById('btnNormalLeaderboard');
        const hardLeaderboardBtn = document.getElementById('btnHardLeaderboard');

        const switchMode = (isHardMode) => {
            this.currentLeaderboard = isHardMode ? 'hard' : 'normal';
            this.setupRealtime();
            this.loadLeaderboard();
        };

        normalLeaderboardBtn.addEventListener('click', () => {
            normalLeaderboardBtn.classList.add('active');
            hardLeaderboardBtn.classList.remove('active');
            switchMode(false);
        });

        hardLeaderboardBtn.addEventListener('click', () => {
            hardLeaderboardBtn.classList.add('active');
            normalLeaderboardBtn.classList.remove('active');
            switchMode(true);
        });
    }

    generateLevel() {
        // Room requirements
        // Min: 5 red, 1 yellow, 2 green, 1 purple
        // Max: 15 red, 2 yellow (if >11 red), 5 green (if 10 red), 1 purple

        let rooms = [];
        this.allRooms = []; // Clear previous rooms

        // Add minimum required rooms - OHNE den violetten Raum
        for (let i = 0; i < 5; i++) rooms.push(new Room("red"));
        rooms.push(new Room("yellow"));
        rooms.push(new Room("green"));
        rooms.push(new Room("green"));
        // WICHTIGE ÄNDERUNG: Den violetten Raum noch NICHT hinzufügen

        // Add additional red rooms (up to 15 total)
        const additionalRedRooms = Math.floor(Math.random() * 16); // 0 to 20 more red rooms
        for (let i = 0; i < additionalRedRooms; i++) {
            rooms.push(new Room("red"));
        }

        const redRoomCount = 5 + additionalRedRooms;

        // Add second yellow room if >11 red rooms
        if (redRoomCount > 11) {
            rooms.push(new Room("yellow"));
        }

        // Add additional green rooms if exactly 10 red rooms (up to 5 total)
        if (redRoomCount === 10) {
            const additionalGreenRooms = Math.floor(Math.random() * 4); // 0 to 3 more green rooms
            for (let i = 0; i < additionalGreenRooms; i++) {
                rooms.push(new Room("green"));
            }
        }

        // Shuffle rooms
        for (let i = rooms.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [rooms[i], rooms[j]] = [rooms[j], rooms[i]];
        }

        const directions = ["north", "south", "east", "west"];

        // Create a gray starting room
        const startRoom = new Room("gray");
        startRoom.x = this.mapCenter;
        startRoom.y = this.mapCenter;

        // Add start room to all rooms
        this.allRooms.push(startRoom);

        // Set up a queue for the room layout creation
        let queue = [startRoom];
        let placedRooms = [startRoom];

        // Create a map of the dungeon layout for easier reference
        let dungeonMap = {};
        dungeonMap[`${startRoom.x},${startRoom.y}`] = startRoom;

        // Platziere ungefähr die Hälfte der normalen Räume zuerst
        let firstHalfComplete = false;
        let placedRoomCount = 0;
        const targetFirstHalfRooms = Math.floor(rooms.length / 2);

        // Keep track of directions from each coordinate
        while (queue.length > 0 && (rooms.length > 0 || !firstHalfComplete)) {
            const currentRoom = queue.shift();

            // Wenn die erste Hälfte fertig ist und wir noch den violetten Raum nicht platziert haben
            if (!firstHalfComplete && placedRoomCount >= targetFirstHalfRooms) {
                firstHalfComplete = true;
                // Füge den violetten Raum jetzt hinzu - er wird nach der Hälfte der Räume platziert
                rooms.push(new Room("purple"));
            }

            // Try to connect to a new room in each direction
            for (const direction of this.shuffleArray([...directions])) {
                if (rooms.length === 0) break;

                // Calculate new coordinates
                let newX = currentRoom.x;
                let newY = currentRoom.y;

                switch (direction) {
                    case "north": newY--; break;
                    case "south": newY++; break;
                    case "east": newX++; break;
                    case "west": newX--; break;
                }

                // Check if the position is already occupied
                const posKey = `${newX},${newY}`;
                if (dungeonMap[posKey]) continue;

                // Check if the position is within map bounds
                if (Math.abs(newX - this.mapCenter) > 3 || Math.abs(newY - this.mapCenter) > 3) {
                    continue;
                }

                // Add a new room
                const newRoom = rooms.pop();
                newRoom.x = newX;
                newRoom.y = newY;
                placedRoomCount++;

                // Add monsters if it's a red room
                if (newRoom.color === 'red') {
                    this.addMonstersToRoom(newRoom);
                }

                // Add new room to all rooms collection
                this.allRooms.push(newRoom);

                // Connect rooms in both directions
                currentRoom.connect(direction, newRoom);

                // Connect in the opposite direction
                let oppositeDirection;
                switch (direction) {
                    case "north": oppositeDirection = "south"; break;
                    case "south": oppositeDirection = "north"; break;
                    case "east": oppositeDirection = "west"; break;
                    case "west": oppositeDirection = "east"; break;
                }
                newRoom.connect(oppositeDirection, currentRoom);

                // Add to map and queue
                dungeonMap[posKey] = newRoom;
                placedRooms.push(newRoom);
                queue.push(newRoom);
            }
        }

        // Rest der Methode bleibt unverändert...
        // Add more connections between existing rooms
        for (let i = 0; i < 15; i++) {
            const room1 = placedRooms[Math.floor(Math.random() * placedRooms.length)];

            // Check each direction for potential connections
            for (const direction of this.shuffleArray([...directions])) {
                if (room1.connections[direction]) continue; // Already connected

                // Calculate adjacent coordinates
                let checkX = room1.x;
                let checkY = room1.y;

                switch (direction) {
                    case "north": checkY--; break;
                    case "south": checkY++; break;
                    case "east": checkX++; break;
                    case "west": checkX--; break;
                }

                // Check if there's a room at these coordinates
                const posKey = `${checkX},${checkY}`;
                const room2 = dungeonMap[posKey];

                if (room2) {
                    // Calculate opposite direction
                    let oppositeDirection;
                    switch (direction) {
                        case "north": oppositeDirection = "south"; break;
                        case "south": oppositeDirection = "north"; break;
                        case "east": oppositeDirection = "west"; break;
                        case "west": oppositeDirection = "east"; break;
                    }

                    // Connect rooms if opposite direction is free
                    if (!room2.connections[oppositeDirection]) {
                        room1.connect(direction, room2);
                        room2.connect(oppositeDirection, room1);
                        break; // Successfully added a connection
                    }
                }
            }
        }
        console.log(`Placed ${placedRoomCount} rooms on the map`);
        // Place any remaining rooms
        if (rooms.length > 0) {
            console.log(`Warning: ${rooms.length} rooms weren't placed on the map`);
        }

        return startRoom;
    }

    // Add monsters to red rooms with scaling difficulty
    addMonstersToRoom(room) {
        if (room.color !== 'red') return;

        // Calculate monster count: base 1-2 monsters, add a third if level > 10
        let monsterCount = Math.floor(Math.random() * 2) + 1;

        // Every 10 levels, chance for an additional monster
        if (this.level > 10 && Math.random() < 0.7) {
            monsterCount += 1;
        }

        // Hard mode: chance for one more monster
        if (this.hardMode && Math.random() < 0.4) {
            monsterCount += 1;
        }

        // Maximum of 3 monsters per room (4 in hard mode)
        monsterCount = Math.min(monsterCount, this.hardMode ? 4 : 3);

        // Base monster health increases every 5 levels
        let baseHealth = 3;
        baseHealth += Math.floor(this.level / 5);

        // Hard mode: monsters have more health
        if (this.hardMode) {
            baseHealth += 1;
        }

        // Add monsters with scaling health
        for (let i = 0; i < monsterCount; i++) {
            // Some monsters can be slightly stronger or weaker
            const healthVariation = Math.floor(Math.random() * 3) - 1; // -1, 0, or +1
            const health = Math.max(2, baseHealth + healthVariation);

            // Hard mode: monsters have higher hit chance
            const hitChanceModifier = this.hardMode ? 0.03 : 0.01;

            room.monsters.push({
                health: health,
                maxHealth: health,
                hitChance: 0.2 + (this.level * hitChanceModifier) // Hit chance increases with level
            });
        }
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    initializeMap() {
        const mapElement = document.getElementById('map');
        mapElement.innerHTML = '';

        for (let y = 0; y < this.mapSize; y++) {
            for (let x = 0; x < this.mapSize; x++) {
                const cell = document.createElement('div');
                cell.className = 'map-cell';
                cell.id = `map-${x}-${y}`;
                mapElement.appendChild(cell);
            }
        }
    }

    updateMap() {
        // Clear previous map
        for (let y = 0; y < this.mapSize; y++) {
            for (let x = 0; x < this.mapSize; x++) {
                const cell = document.getElementById(`map-${x}-${y}`);
                cell.innerHTML = '';
            }
        }

        // First, show unexplored connections from current room
        for (const [direction, connectedRoom] of Object.entries(this.currentRoom.connections)) {
            if (!this.visitedRooms.has(connectedRoom)) {
                // Show unexplored room with lower opacity
                const mapX = connectedRoom.x - this.currentRoom.x + this.mapCenter;
                const mapY = connectedRoom.y - this.currentRoom.y + this.mapCenter;

                if (mapX >= 0 && mapX < this.mapSize && mapY >= 0 && mapY < this.mapSize) {
                    const cell = document.getElementById(`map-${mapX}-${mapY}`);

                    // Create unexplored room display
                    const roomDiv = document.createElement('div');
                    roomDiv.className = `map-room ${connectedRoom.color} unexplored-room`;
                    cell.appendChild(roomDiv);

                    // Show connection to current room
                    const oppositeDirection = this.getOppositeDirection(direction);
                    const connDiv = document.createElement('div');
                    connDiv.className = `map-connection map-${oppositeDirection}`;
                    connDiv.style.opacity = '0.5';
                    cell.appendChild(connDiv);

                    // Also show connection from current room
                    const currentCell = document.getElementById(`map-${this.mapCenter}-${this.mapCenter}`);
                    const currentConnDiv = document.createElement('div');
                    currentConnDiv.className = `map-connection map-${direction}`;
                    currentConnDiv.style.opacity = '0.5';
                    currentCell.appendChild(currentConnDiv);
                }
            }
        }

        // Display all discovered rooms
        this.visitedRooms.forEach(room => {
            const mapX = room.x - this.currentRoom.x + this.mapCenter;
            const mapY = room.y - this.currentRoom.y + this.mapCenter;

            if (mapX >= 0 && mapX < this.mapSize && mapY >= 0 && mapY < this.mapSize) {
                const cell = document.getElementById(`map-${mapX}-${mapY}`);

                // Create room display
                const roomDiv = document.createElement('div');
                roomDiv.className = `map-room ${room.color}`;

                // Mark current room
                if (room === this.currentRoom) {
                    roomDiv.classList.add('map-current');
                }

                // Add special icon for trapdoor room if revealed
                if (this.revealTrapdoor && room.isPurpleWithTrapdoor()) {
                    roomDiv.innerHTML = '';
                }

                cell.appendChild(roomDiv);

                // Show connections to discovered rooms
                for (const [direction, connectedRoom] of Object.entries(room.connections)) {
                    if (this.visitedRooms.has(connectedRoom)) {
                        const connDiv = document.createElement('div');
                        connDiv.className = `map-connection map-${direction}`;
                        cell.appendChild(connDiv);
                    }
                }
            }
        });

        // If trapdoor is revealed, show all purple rooms on the map
        if (this.revealTrapdoor) {
            this.allRooms.forEach(room => {
                if (room.isPurpleWithTrapdoor()) {
                    const mapX = room.x - this.currentRoom.x + this.mapCenter;
                    const mapY = room.y - this.currentRoom.y + this.mapCenter;

                    if (mapX >= 0 && mapX < this.mapSize && mapY >= 0 && mapY < this.mapSize) {
                        const cell = document.getElementById(`map-${mapX}-${mapY}`);

                        // Check if cell already has room display
                        let roomDiv = cell.querySelector('.map-room');

                        if (!roomDiv) {
                            // Create new room display
                            roomDiv = document.createElement('div');
                            roomDiv.className = `map-room ${room.color}`;

                            if (!this.visitedRooms.has(room)) {
                                roomDiv.classList.add('unexplored-room');
                            }

                            cell.appendChild(roomDiv);
                        }

                        // Add trapdoor icon
                        roomDiv.innerHTML = '';
                    }
                }
            });
        }
    }

    getOppositeDirection(direction) {
        switch (direction) {
            case "north": return "south";
            case "south": return "north";
            case "east": return "west";
            case "west": return "east";
            default: return direction;
        }
    }

    move(direction) {
        if (this.combatMode) {
            this.logMessage("You can't move while in combat! Defeat the monsters first.");
            return;
        }

        if (this.inUpgradeMode) {
            this.logMessage("Choose an upgrade first before moving!");
            return;
        }

        if (direction in this.currentRoom.connections) {
            this.currentRoom = this.currentRoom.connections[direction];
            this.currentRoom.discovered = true;
            this.visitedRooms.add(this.currentRoom);

            // Continuing from where the code was cut off:

            this.logMessage(`You moved ${direction} to a ${this.currentRoom.color} room.`);

            // Handle red room (monsters)
            if (this.currentRoom.color === 'red' && this.currentRoom.monsters.length > 0) {
                this.enterCombatMode();
            }

            // Handle yellow room (upgrade)
            if (this.currentRoom.color === 'yellow' && !this.currentRoom.upgradeUsed) {
                this.enterUpgradeMode();
            }

            this.updateRoomDisplay();
            this.updateMap();
            this.updateButtonStates();
        } else {
            this.logMessage(`You can't go ${direction}. There's no passage that way.`);
        }
    }

    goDown() {
        if (this.currentRoom.color !== 'purple') {
            this.logMessage("You can't go down from here. Find a purple room with a trapdoor.");
            return;
        }

        this.level++;
        this.logMessage(`You found a trapdoor and descended to level ${this.level}.`);

        // Reset trapdoor reveal for the new level
        this.revealTrapdoor = false;

        // Generate new level
        this.visitedRooms = new Set();
        this.currentRoom = this.generateLevel();
        this.currentRoom.discovered = true;
        this.visitedRooms.add(this.currentRoom);

        this.updateRoomDisplay();
        this.updateStatsDisplay();
        this.initializeMap();
        this.updateMap();
        this.updateButtonStates();
    }

    enterCombatMode() {
        this.combatMode = true;
        this.logMessage("Monsters! Get ready to fight!", "red");
        this.updateButtonStates();
        this.displayMonsters();
    }

    exitCombatMode() {
        this.combatMode = false;
        this.updateButtonStates();
        const combatControls = document.getElementById('combatControls');
        if (combatControls) {
            combatControls.remove(); // Statt nur den Button zu entfernen
        }
        document.getElementById('monsterContainer').innerHTML = '';
    }
    displayMonsters() {
        const monsterContainer = document.getElementById('monsterContainer');
        const actionButtons = document.getElementById('actionButtons');
        monsterContainer.innerHTML = '';

        // Display combat controls if not already there
        let combatControls = document.getElementById('combatControls');
        if (!combatControls) {
            combatControls = document.createElement('div');
            combatControls.id = 'combatControls';
            combatControls.className = 'combat-controls';

            const attackBtn = document.createElement('button');
            attackBtn.id = 'btnAttack';
            attackBtn.className = 'btn';
            attackBtn.textContent = 'Attack';
            attackBtn.addEventListener('click', () => this.attackRandomMonster());

            combatControls.appendChild(attackBtn);
            actionButtons.appendChild(combatControls);
        }
        this.currentRoom.monsters.forEach((monster, index) => {
            const monsterDiv = document.createElement('div');
            monsterDiv.className = 'monster monster-float';
            monsterDiv.innerHTML = `
            <div class="monster-icon"></div>
            <div class="monster-health">
                ${Array(monster.health).fill('<span class="monster-heart">♥</span>').join('')}
            </div>
        `;

            document.getElementById('actionButtons').appendChild(combatControls);
            monsterDiv.dataset.index = index;

            // Zufällige Farbvariationen
            const hue = Math.random() * 20 + 330; // Rot/Purple Töne
            monsterDiv.style.backgroundColor = `hsl(${hue}, 70%, 40%)`;
            monsterDiv.style.borderColor = `hsl(${hue}, 70%, 30%)`;

            // Größenvariation basierend auf Gesundheit
            const scale = 0.8 + (monster.health * 0.1);
            monsterDiv.style.transform = `scale(${scale})`;

            monsterDiv.addEventListener('click', () => this.attackMonster(index));
            monsterContainer.appendChild(monsterDiv);
        });
    }
    // displayMonsters() {
    //     const monsterContainer = document.getElementById('monsterContainer');
    //     monsterContainer.innerHTML = '';

    //     // Display combat controls if not already there
    //     if (!document.getElementById('combatControls')) {
    //         const combatControls = document.createElement('div');
    //         combatControls.id = 'combatControls';
    //         combatControls.className = 'combat-controls';

    //         const attackBtn = document.createElement('button');
    //         attackBtn.id = 'btnAttack';
    //         attackBtn.className = 'btn';
    //         attackBtn.textContent = 'Attack';
    //         attackBtn.addEventListener('click', () => this.attackRandomMonster());

    //         combatControls.appendChild(attackBtn);
    //         document.getElementById('actionButtons').appendChild(combatControls);
    //     }

    //     this.currentRoom.monsters.forEach((monster, index) => {
    //         const monsterDiv = document.createElement('div');
    //         monsterDiv.className = 'monster';
    //         monsterDiv.textContent = 'M';
    //         monsterDiv.dataset.index = index;

    //         // Create monster health display
    //         const healthDisplay = document.createElement('div');
    //         healthDisplay.className = 'monster-health';

    //         for (let i = 0; i < monster.health; i++) {
    //             const heart = document.createElement('span');
    //             heart.className = 'monster-heart';
    //             heart.textContent = '♥';
    //             healthDisplay.appendChild(heart);
    //         }

    //         monsterDiv.appendChild(healthDisplay);
    //         monsterDiv.addEventListener('click', () => this.attackMonster(index));

    //         monsterContainer.appendChild(monsterDiv);
    //     });
    // }

    attackRandomMonster() {
        if (!this.combatMode || this.currentRoom.monsters.length === 0) return;

        const index = Math.floor(Math.random() * this.currentRoom.monsters.length);
        this.attackMonster(index);
    }

    attackMonster(index) {
        if (!this.combatMode) return;

        const monster = this.currentRoom.monsters[index];
        if (!monster || this.playerHealth <= 0) return;

        // Player attack
        monster.health -= this.playerDamage;
        this.logMessage(`You hit the monster for ${this.playerDamage} damage!`);

        // Monster death
        if (monster.health <= 0) {
            this.currentRoom.monsters.splice(index, 1); // Fixed: Changed from splice(index, 0, 1)[0] to splice(index, 1)
            this.logMessage("You defeated a monster!");

            // Update monster display
            this.displayMonsters();

            // Check if all monsters are defeated
            if (this.currentRoom.monsters.length === 0) {
                this.logMessage("You've cleared the room of all monsters!");
                const attackBtn = document.getElementById('combatControls');
                if (attackBtn) {
                    attackBtn.remove();
                }
                this.exitCombatMode();
            }

            return;
        }

        // Update monster display
        this.displayMonsters();

        // Monster counterattack
        this.monsterAttack();
    }

    monsterAttack() {
        // Each monster has a chance to hit
        let totalDamage = 0;

        this.currentRoom.monsters.forEach(monster => {
            // In hard mode, there's a small chance for critical hits
            if (Math.random() < monster.hitChance) {
                // Critical hit in hard mode
                if (this.hardMode && Math.random() < 0.15) {
                    totalDamage += 2;
                    this.logMessage("A monster landed a critical hit!", "red");
                } else {
                    totalDamage++;
                }
            }
        });

        if (totalDamage > 0) {
            this.playerHealth = Math.max(this.playerHealth - totalDamage, 0);
            this.logMessage(`The monsters hit you for ${totalDamage} damage!`);

            // Shake effect on damage
            const roomElement = document.getElementById('currentRoom');
            roomElement.classList.add('shake');
            setTimeout(() => {
                roomElement.classList.remove('shake');
            }, 500);

            if (this.playerHealth <= 0) {
                this.gameOver = true;
                this.updateStatsDisplay();
                this.showGameOver();
                this.logMessage("You have been defeated. Game over!", "red");
                return;
            }

            this.updateStatsDisplay();
        } else {
            this.logMessage("The monsters missed their attacks!");
        }
    }

    enterUpgradeMode() {
        this.inUpgradeMode = true;
        this.logMessage("Yellow rooms let you upgrade! Choose carefully...", "yellow");

        // Create upgrade options
        const upgradeOptions = document.createElement('div');
        upgradeOptions.className = 'upgrade-options';
        upgradeOptions.id = 'upgradeOptions';

        // Health upgrade - Different label based on hard mode
        const healthBtn = document.createElement('button');
        healthBtn.id = 'btnHealthUpgrade';
        healthBtn.className = 'btn upgrade-btn';
        healthBtn.textContent = this.hardMode ? 'Health +1' : 'Health +2';
        healthBtn.addEventListener('click', () => this.applyUpgrade('health'));

        // Damage upgrade
        const damageBtn = document.createElement('button');
        damageBtn.id = 'btnHealthUpgrade';
        damageBtn.className = 'btn upgrade-btn';
        damageBtn.textContent = 'Damage +1';
        damageBtn.addEventListener('click', () => this.applyUpgrade('damage'));

        // Append the first two buttons
        upgradeOptions.appendChild(healthBtn);
        upgradeOptions.appendChild(damageBtn);

        // Only add reveal trapdoor button in non-hard mode
        if (!this.hardMode) {
            // Reveal trapdoor upgrade - only show in normal mode
            const revealBtn = document.createElement('button');
            revealBtn.id = 'btnHealthUpgrade';
            revealBtn.className = 'btn upgrade-btn';
            revealBtn.textContent = 'Reveal Trapdoor';
            revealBtn.addEventListener('click', () => this.applyUpgrade('reveal'));
            upgradeOptions.appendChild(revealBtn);
        }

        document.getElementById('actionButtons').appendChild(upgradeOptions);
        this.updateButtonStates();
    }

    applyUpgrade(type) {
        if (!this.inUpgradeMode) return;

        switch (type) {
            case 'health':
                // Less health gain in hard mode
                const healthGain = this.hardMode ? 1 : 2;
                this.playerHealth = Math.min(this.maxHealth, this.playerHealth + healthGain);
                this.logMessage(`You upgraded your health by ${healthGain} point${healthGain > 1 ? 's' : ''}!`);
                break;
            case 'damage':
                this.playerDamage = Math.min(this.maxDamage, this.playerDamage + 1);
                this.logMessage("You upgraded your damage by 1 point!");
                break;
            case 'reveal':
                this.revealTrapdoor = true;
                this.logMessage("The location of the trapdoor has been revealed on your map!");
                break;
        }

        // Mark upgrade as used and exit upgrade mode
        this.currentRoom.upgradeUsed = true;
        this.inUpgradeMode = false;

        // Remove upgrade options
        const upgradeOptions = document.getElementById('upgradeOptions');
        if (upgradeOptions) {
            upgradeOptions.remove();
        }

        this.updateStatsDisplay();
        this.updateMap();
        this.updateButtonStates();
    }
    showGameOver() {
        // Disable all buttons
        document.getElementById('btnNorth').disabled = true;
        document.getElementById('btnSouth').disabled = true;
        document.getElementById('btnEast').disabled = true;
        document.getElementById('btnWest').disabled = true;
        document.getElementById('btnDown').disabled = true;

        // Update button styles
        this.updateButtonStyles();

        // Create restart button if it doesn't exist
        if (!document.getElementById('btnRestart')) {
            const restartBtn = document.createElement('button');
            restartBtn.id = 'btnRestart';
            restartBtn.className = 'btn';
            restartBtn.textContent = 'Restart Game';
            restartBtn.addEventListener('click', () => this.restartGame());
            document.getElementById('actionButtons').appendChild(restartBtn);
        }

        // Show leaderboard entry
        document.getElementById('playerNameInput').style.display = 'block';
        this.logMessage("Enter your name to save your score!", "yellow");
    }
    restartGame() {
        // Remove restart button
        const restartBtn = document.getElementById('btnRestart');
        const gameDisplay = document.getElementById('gameDisplay');
        if (restartBtn) {
            restartBtn.remove();
        }

        // Reset game state
        this.level = 1;
        this.playerHealth = 3;
        this.playerDamage = 1;
        this.revealTrapdoor = false;
        this.combatMode = false;
        this.inUpgradeMode = false;
        this.visitedRooms = new Set();
        this.allRooms = [];
        this.gameOver = false;
        // Hard mode remains the same unless toggled

        // Hide player name input
        document.getElementById('playerNameInput').style.display = 'none';

        // Generate new level
        this.currentRoom = this.generateLevel();
        this.currentRoom.discovered = true;
        this.visitedRooms.add(this.currentRoom);

        gameDisplay.innerText = ''; // Clear game display
        this.logMessage(`Game restarted! You are back at level 1. Hard mode is ${this.hardMode ? 'ON' : 'OFF'}.`);
        this.updateRoomDisplay();
        this.updateStatsDisplay();
        this.initializeMap();
        this.updateMap();
        this.updateButtonStates();
    }

    updateButtonStyles() {
        // Apply disabled styling to buttons
        const buttons = ['btnNorth', 'btnSouth', 'btnEast', 'btnWest', 'btnDown'];
        buttons.forEach(id => {
            const button = document.getElementById(id);
            if (button.disabled) {
                button.classList.add('btn-disabled');
            } else {
                button.classList.remove('btn-disabled');
            }
        });
    }
    async saveScore() {
        const validHealth = Math.max(this.playerHealth, 0);
        const validDamage = Math.max(this.playerDamage, 0);
        const playerId = this.getPlayerId();
        const playerName = document.getElementById('playerName').value.trim().substring(0, 15);
        if (this.level === 1) return;

        try {
            // Check existing entry for current mode
            const { data: existing } = await supabase
                .from('leaderboard')
                .select()
                .match({
                    player_id: playerId,
                    hard_mode: this.hardMode
                })
                .single();

            // Determine if new score is better
            let shouldUpdate = true;
            if (existing) {
                const isBetter =
                    this.level > existing.level ||
                    (this.level === existing.level && validHealth > existing.health) ||
                    (this.level === existing.level && validHealth === existing.health && validDamage > existing.damage);

                if (!isBetter) {
                    this.logMessage("Kein neuer Highscore - wird nicht gespeichert", "yellow");
                    return;
                }

                // Delete old entry if exists
                const { error: deleteError } = await supabase
                    .from('leaderboard')
                    .delete()
                    .eq('player_id', playerId)
                    .eq('hard_mode', this.hardMode);

                if (deleteError) throw deleteError;
            }

            // Insert new entry
            const { error: insertError } = await supabase
                .from('leaderboard')
                .insert({
                    player_id: playerId,
                    player_name: playerName,
                    level: this.level,
                    health: validHealth,
                    damage: validDamage,
                    hard_mode: this.hardMode,
                    timestamp: new Date().toISOString()
                });

            if (insertError) throw insertError;

            this.logMessage(`Neuer Highscore gespeichert! (Level ${this.level})`, "green");
            this.restartGame();
            document.getElementById('playerNameInput').style.display = 'none';

        } catch (error) {
            console.error("Speicherfehler:", error);
            this.logMessage("Fehler beim Speichern: " + error.message, "red");
        }
    }
    sortAndTrimLeaderboard(leaderboard) {
        // Sort leaderboard
        leaderboard.sort((a, b) => {
            if (a.level !== b.level) return b.level - a.level;
            if (a.health !== b.health) return b.health - a.health;
            return b.damage - a.damage;
        });

        // Keep only top 10
        if (leaderboard.length > 10) {
            return leaderboard.slice(0, 10);
        }

        return leaderboard;
    }
    setupRealtime() {
        // Alten Channel entfernen
        if (this.leaderboardChannel) {
            supabase.removeChannel(this.leaderboardChannel);
        }

        // Neuen Channel erstellen
        this.leaderboardChannel = supabase
            .channel('leaderboard')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'leaderboard',
                filter: `hard_mode=eq.${this.currentLeaderboard === 'hard'}`
            }, () => this.loadLeaderboard())
            .subscribe();
    }
    async loadLeaderboard() {
        try {
            const modeFilter = this.currentLeaderboard === 'hard'
                ? { hard_mode: true }
                : { hard_mode: false };

            const { data, error } = await supabase
                .from('leaderboard')
                .select('*')
                .match(modeFilter)
                .order('level', { ascending: false })
                .order('health', { ascending: false })
                .order('damage', { ascending: false })
                .limit(10);

            if (error) throw error;
            this.displayLeaderboard(data || []);
        } catch (error) {
            console.error("Ladefehler:", error);
        }
    }

    // Modified saveLeaderboard to handle different modes
    saveLeaderboard(mode, data) {
        const key = `dungeonCrawlerLeaderboard_${mode}`;
        localStorage.setItem(key, JSON.stringify(data));
    }

    displayLeaderboard(scores) {
        const leaderboardBody = document.getElementById('leaderboardBody');
        leaderboardBody.innerHTML = '';

        scores.forEach((entry, index) => {
            const row = document.createElement('tr');
            const date = new Date(entry.timestamp).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                year: '2-digit',
                hour: 'numeric',
                minute: '2-digit',
                weekday: 'short',
            })

            row.innerHTML = `
        <td>${index + 1}</td>
        <td>${entry.player_name || 'Anonymous'}</td>
        <td>${entry.level}</td>
        <td>${entry.health}</td>
        <td>${entry.damage}</td>
        <td>${date}</td>
      `;

            leaderboardBody.appendChild(row);
        });
    }


    updateRoomDisplay() {
        const roomElement = document.getElementById('currentRoom');
        const roomTextElement = document.getElementById('roomText');
        const locationElement = document.getElementById('currentLocationText');

        // Update room color
        roomElement.className = `room ${this.currentRoom.color}`;

        // Update room text
        if (this.currentRoom.color != "red") {
            roomTextElement.textContent = `${this.capitalize(this.currentRoom.color)} Room`;
        } else {
            roomTextElement.textContent = "";
        }

        // Update location text
        let locationText = '';
        if (this.currentRoom.color === 'gray') {
            locationText = 'Starting Room';
        } else if (this.currentRoom.color === 'purple') {
            locationText = 'Trapdoor Room';
        } else if (this.currentRoom.color === 'red') {
            locationText = 'Monster Room';
        } else if (this.currentRoom.color === 'yellow') {
            locationText = 'Upgrade Room';
        } else if (this.currentRoom.color === 'green') {
            locationText = 'Safe Room';
        }
        locationElement.textContent = locationText;

        // Display monsters if in a red room with monsters
        if (this.currentRoom.color === 'red' && this.currentRoom.monsters.length > 0) {
            this.displayMonsters();
        } else {
            document.getElementById('monsterContainer').innerHTML = '';

            // Remove combat controls if they exist
            const combatControls = document.getElementById('combatControls');
            if (combatControls) {
                combatControls.remove();
            }
        }
    }

    updateStatsDisplay() {
        // Update player health with hearts
        const healthDisplay = document.getElementById('playerHealth');
        healthDisplay.innerHTML = '';

        for (let i = 0; i < this.playerHealth; i++) {
            const heart = document.createElement('span');
            heart.className = 'heart';
            heart.textContent = '♥';
            healthDisplay.appendChild(heart);
        }

        // Update player damage with swords
        const damageDisplay = document.getElementById('playerDamage');
        damageDisplay.innerHTML = '';

        for (let i = 0; i < this.playerDamage; i++) {
            const sword = document.createElement('span');
            sword.className = 'sword';
            sword.textContent = '⚔';
            damageDisplay.appendChild(sword);
        }

        // Update caps display
        document.getElementById('healthCap').textContent = `(max: ${this.maxHealth})`;
        document.getElementById('damageCap').textContent = `(max: ${this.maxDamage})`;

        // Update level info
        document.getElementById('levelInfo').textContent = `Level ${this.level}`;
    }

    updateButtonStates() {
        // Direction buttons
        document.getElementById('btnNorth').disabled = !('north' in this.currentRoom.connections) || this.combatMode || this.inUpgradeMode || this.gameOver;
        document.getElementById('btnSouth').disabled = !('south' in this.currentRoom.connections) || this.combatMode || this.inUpgradeMode || this.gameOver;
        document.getElementById('btnEast').disabled = !('east' in this.currentRoom.connections) || this.combatMode || this.inUpgradeMode || this.gameOver;
        document.getElementById('btnWest').disabled = !('west' in this.currentRoom.connections) || this.combatMode || this.inUpgradeMode || this.gameOver;

        // Down button - only enabled in purple rooms
        document.getElementById('btnDown').disabled = this.currentRoom.color !== 'purple' || this.combatMode || this.inUpgradeMode || this.gameOver;

        // Update button styles
        this.updateButtonStyles();
    }

    logMessage(message, color = 'white') {
        const gameDisplay = document.getElementById('gameDisplay');
        const p = document.createElement('p');
        p.textContent = message;
        p.style.color = color;
        gameDisplay.appendChild(p);
        gameDisplay.scrollTop = gameDisplay.scrollHeight;
    }

    capitalize(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
}


document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();

    document.getElementById('btnNorth').addEventListener('click', () => game.move('north'));
    document.getElementById('btnSouth').addEventListener('click', () => game.move('south'));
    document.getElementById('btnEast').addEventListener('click', () => game.move('east'));
    document.getElementById('btnWest').addEventListener('click', () => game.move('west'));
    document.getElementById('btnDown').addEventListener('click', () => game.goDown());
    document.getElementById('btnSaveScore').addEventListener('click', () => game.saveScore());
});