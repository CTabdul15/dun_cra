import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '');
  
  // Debug - log environment variables during build
  console.log('Environment check in vite.config.js:');
  console.log('VITE_SUPABASE_URL exists:', !!env.VITE_SUPABASE_URL);
  console.log('VITE_SUPABASE_KEY exists:', !!env.VITE_SUPABASE_KEY);
  
  return {
    // Adjust if your repo is deployed to a subdirectory
    base: './',
    // Configure to use the src/index.html as entry point
    root: './src',
    // Define environment variables to expose to your app
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || ''),
      'import.meta.env.VITE_SUPABASE_KEY': JSON.stringify(env.VITE_SUPABASE_KEY || ''),
    },
    build: {
      // Output to the dist folder in the project root
      outDir: '../dist',
      // Ensure assets are correctly referenced
      assetsDir: 'assets',
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/index.html'),
        },
      },
    },
    server: {
      port: 3000,
    },
  };
});