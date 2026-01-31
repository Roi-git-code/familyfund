
const fs = require('fs');
const path = require('path');

console.log('🔍 Checking all route files for syntax errors...');

// Directory containing route files
const routesDir = path.join(__dirname, 'routes');

// Function to check a file for route patterns
function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  
  console.log(`\n📄 Checking: ${path.basename(filePath)}`);
  
  lines.forEach((line, index) => {
    // Look for router.get, router.post, router.put, router.delete, etc.
    const routePatterns = [
      /router\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]/g
    ];
    
    routePatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const method = match[1];
        const routePath = match[2];
        console.log(`   Line ${index + 1}: ${method.toUpperCase()} ${routePath}`);
        
        // Check for common errors
        if (routePath.includes('//')) {
          console.error(`   ❌ ERROR: Double slash in route: ${routePath}`);
        }
        if (routePath.includes('/:')) {
          const paramMatch = routePath.match(/\/:([^\/]+)/g);
          paramMatch?.forEach(param => {
            if (param === '/:' || param.endsWith('/:')) {
              console.error(`   ❌ ERROR: Missing parameter name: ${routePath}`);
            }
          });
        }
      }
    });
  });
}

// Check all route files
const routeFiles = fs.readdirSync(routesDir).filter(file => file.endsWith('.js'));

routeFiles.forEach(file => {
  checkFile(path.join(routesDir, file));
});

console.log('\n✅ Route checking completed');


