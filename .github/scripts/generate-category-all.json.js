#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Function to get the last git commit timestamp for a metadata file
function getLastCommitTimestampForMetadataFile(filePath) {
    console.log(`🔍 Getting timestamp for: ${filePath}`);
    
    try {
        const workingDir = path.join(__dirname, '../..');
        
        // Use git log to get the most recent commit timestamp for the metadata file
        const gitCommand = `git log -1 --format=%ct --follow -- "${filePath}"`;
        
        const result = execSync(gitCommand, {
            encoding: 'utf8',
            stdio: 'pipe',
            cwd: workingDir
        }).trim();

        if (result) {
            const timestamp = parseInt(result);
            console.log(`✅ Found timestamp: ${new Date(timestamp * 1000).toISOString()}`);
            return timestamp;
        }

        // Fallback to current time if no commits found
        const fallbackTimestamp = Math.floor(Date.now() / 1000);
        console.log(`⚠️ No git history found, using current time: ${new Date(fallbackTimestamp * 1000).toISOString()}`);
        return fallbackTimestamp;
    } catch (error) {
        console.warn(`⚠️ Could not get git timestamp for '${filePath}': ${error.message}`);
        // Fallback to current time
        const errorFallbackTimestamp = Math.floor(Date.now() / 1000);
        console.log(`⚠️ Using fallback timestamp: ${new Date(errorFallbackTimestamp * 1000).toISOString()}`);
        return errorFallbackTimestamp;
    }
}

// Function to recursively find all metadata.json files
function findAllMetadataFiles(dir, basePath = '') {
    const metadataFiles = [];
    
    try {
        const items = fs.readdirSync(dir);
        
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const relativePath = path.join(basePath, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                // Recursively search subdirectories
                metadataFiles.push(...findAllMetadataFiles(fullPath, relativePath));
            } else if (item === 'metadata.json') {
                metadataFiles.push({
                    fullPath: fullPath,
                    relativePath: relativePath,
                    directoryPath: basePath
                });
            }
        }
    } catch (error) {
        console.warn(`⚠️ Could not read directory ${dir}: ${error.message}`);
    }
    
    return metadataFiles;
}

// Function to read and parse all metadata files
function readAllMetadataFiles() {
    const repositoriesDir = path.join(__dirname, '../..', 'repositories');
    
    console.log(`📁 Searching for metadata.json files in: ${repositoriesDir}`);
    
    if (!fs.existsSync(repositoriesDir)) {
        console.log('❌ Repositories directory does not exist');
        return [];
    }

    const metadataFiles = findAllMetadataFiles(repositoriesDir, 'repositories');
    console.log(`📄 Found ${metadataFiles.length} metadata.json files`);

    const apps = [];

    for (const metadataFile of metadataFiles) {
        try {
            console.log(`📖 Reading: ${metadataFile.relativePath}`);
            const content = fs.readFileSync(metadataFile.fullPath, 'utf8');
            const metadata = JSON.parse(content);
            
            // Get git timestamp for this metadata file
            const lastUpdated = getLastCommitTimestampForMetadataFile(metadataFile.relativePath);
            
            // Create app slug from the directory structure
            const pathParts = metadataFile.directoryPath.split(path.sep);
            // Remove 'repositories' from the beginning
            pathParts.shift();
            const appSlug = pathParts.join('/');
            
            const app = {
                ...metadata,
                slug: appSlug,
                lastUpdated: lastUpdated,
                metadataPath: metadataFile.relativePath.replace(/\\/g, '/') // Normalize path separators
            };
            
            apps.push(app);
            console.log(`✅ Added app: ${metadata.name} (Category: ${metadata.category})`);
            
        } catch (error) {
            console.warn(`⚠️ Could not read ${metadataFile.relativePath}: ${error.message}`);
        }
    }
    
    return apps;
}

// Function to organize apps by category
function organizeAppsByCategory(apps) {
    const categories = {};
    
    for (const app of apps) {
        const categoryName = app.category || 'Uncategorized';
        
        if (!categories[categoryName]) {
            categories[categoryName] = {
                name: categoryName,
                slug: categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                count: 0,
                apps: []
            };
        }
        
        categories[categoryName].count++;
        categories[categoryName].apps.push(app);
    }
    
    // Sort apps within each category by name
    for (const categoryName in categories) {
        categories[categoryName].apps.sort((a, b) => a.name.localeCompare(b.name));
    }
    
    return categories;
}

// Function to get category last updated timestamp (most recent app in the category)
function getCategoryLastUpdated(apps) {
    return Math.max(...apps.map(app => app.lastUpdated));
}

// Main function
async function main() {
    console.log('🔄 Generating category-all.json with complete app metadata...');

    // Read all metadata files
    const apps = readAllMetadataFiles();
    
    if (apps.length === 0) {
        console.log('ℹ️ No metadata files found.');
        return;
    }

    console.log(`\n📊 Found ${apps.length} apps total`);

    // Organize apps by category
    const categoriesMap = organizeAppsByCategory(apps);
    const categoriesArray = Object.values(categoriesMap);
    
    // Add lastUpdated timestamp to each category
    for (const category of categoriesArray) {
        category.lastUpdated = getCategoryLastUpdated(category.apps);
    }
    
    // Sort categories by name
    categoriesArray.sort((a, b) => a.name.localeCompare(b.name));

    // Create final category-all.json structure
    const categoryAllData = {
        generated: Math.floor(Date.now() / 1000),
        generatedISO: new Date().toISOString(),
        totalCategories: categoriesArray.length,
        totalApps: apps.length,
        categories: categoriesArray
    };

    // Write category-all.json
    const categoryAllFilePath = path.join(__dirname, '../..', 'releases', 'category-all.json');
    
    try {
        fs.writeFileSync(categoryAllFilePath, JSON.stringify(categoryAllData, null, 2), 'utf8');
        console.log(`\n📄 Generated category-all.json with ${categoriesArray.length} categories and ${apps.length} apps`);
        
        // Show summary
        console.log('\n📋 Summary:');
        console.log(`   Total categories: ${categoryAllData.totalCategories}`);
        console.log(`   Total apps: ${categoryAllData.totalApps}`);
        console.log(`   Generated: ${categoryAllData.generatedISO}`);
        
        console.log('\n🏷️ Categories breakdown:');
        for (const category of categoriesArray) {
            console.log(`   ${category.name}: ${category.count} apps (last updated: ${new Date(category.lastUpdated * 1000).toISOString()})`);
        }
        
        console.log('\n✅ Category-all.json generation complete!');
    } catch (error) {
        console.error(`❌ Failed to write category-all.json: ${error.message}`);
        process.exit(1);
    }
}

// Run the script
main().catch(error => {
    console.error('❌ Script failed:', error);
    process.exit(1);
});