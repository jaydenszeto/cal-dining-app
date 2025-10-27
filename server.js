const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));
app.use(express.json());

const BERKELEY_API_URL = "https://dining.berkeley.edu/wp-admin/admin-ajax.php";
const AJAX_ACTION = 'cald_filter_xml';

async function fetchMenuForDate(dateStr) {
    const formData = new URLSearchParams();
    formData.append('action', AJAX_ACTION);
    formData.append('date', dateStr);
    formData.append('location', '');
    formData.append('mealperiod', '');

    try {
        const response = await fetch(BERKELEY_API_URL, {
            method: 'POST',
            body: formData,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        if (!response.ok) return null;
        return await response.text();
    } catch (error) {
        console.error(`Error fetching for ${dateStr}:`, error);
        return null;
    }
}

/**
 * ✅ NEW: A more robust, server-side HTML parser.
 * This version correctly isolates each location's menu before searching,
 * preventing data from one location being attributed to another. It also
 * filters out long descriptions that are not actual menu items.
 */
function findFoodInHtml(htmlText, food, targetLocations) {
    const foundItems = [];
    const locationBlocks = htmlText.split('<li class="location-name');

    for (const block of locationBlocks) {
        if (!block) continue;

        const titleMatch = block.match(/<span class="cafe-title">(.*?)<\/span>/);
        if (!titleMatch || !titleMatch[1]) continue;
        const locationName = titleMatch[1].trim();

        if (!targetLocations.includes(locationName)) {
            continue;
        }

        const mealBlocks = block.split('<li class="preiod-name');
        for (const mealBlock of mealBlocks) {
             const mealNameMatch = mealBlock.match(/<span>(Fall - .*?)<span/);
             if (!mealNameMatch || !mealNameMatch[1]) continue;
             const mealName = mealNameMatch[1].trim().replace("Fall - ", "");

             const recipeItems = mealBlock.split('<li class="recip');
             for(const recipeItem of recipeItems) {
                const recipeNameMatch = recipeItem.match(/<span>(.*?)<\/span>/);
                if (recipeNameMatch && recipeNameMatch[1]) {
                    const recipeName = recipeNameMatch[1].trim();
                    
                    if (recipeName.length < 100 && recipeName.toLowerCase().includes(food.toLowerCase())) {
                        foundItems.push(`<li><strong>${recipeName}</strong> at ${locationName} (${mealName})</li>`);
                    }
                }
             }
        }
    }
    return [...new Set(foundItems)];
}

/**
 * ✅ NEW: Parse full menu for a specific location
 */
function parseFullMenuForLocation(htmlText, targetLocation) {
    const menuData = { location: targetLocation, meals: [] };
    
    const locationBlocks = htmlText.split('<li class="location-name');
    
    for (const block of locationBlocks) {
        if (!block) continue;
        
        const titleMatch = block.match(/<span class="cafe-title">(.*?)<\/span>/);
        if (!titleMatch || !titleMatch[1]) continue;
        const locationName = titleMatch[1].trim();
        
        if (locationName !== targetLocation) continue;
        
        const mealBlocks = block.split('<li class="preiod-name');
        for (const mealBlock of mealBlocks) {
            const mealNameMatch = mealBlock.match(/<span>(Fall - .*?)<span/);
            if (!mealNameMatch || !mealNameMatch[1]) continue;
            const mealName = mealNameMatch[1].trim().replace("Fall - ", "");
            
            const items = [];
            const recipeItems = mealBlock.split('<li class="recip');
            for (const recipeItem of recipeItems) {
                const recipeNameMatch = recipeItem.match(/<span>(.*?)<\/span>/);
                if (recipeNameMatch && recipeNameMatch[1]) {
                    const recipeName = recipeNameMatch[1].trim();
                    if (recipeName.length < 100) {
                        items.push(recipeName);
                    }
                }
            }
            
            if (items.length > 0) {
                menuData.meals.push({ mealName, items });
            }
        }
    }
    
    return menuData;
}

app.post('/api/menu/full-menu', async (req, res) => {
    try {
        const { location, dateOffset = 0 } = req.body;
        if (!location) {
            return res.status(400).json({ error: 'location is required.' });
        }
        
        const date = new Date();
        date.setDate(date.getDate() + dateOffset);
        const dateStr = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
        
        const menuHtml = await fetchMenuForDate(dateStr);
        if (!menuHtml) {
            return res.status(404).json({ error: 'Menu not available for this date.' });
        }
        
        const fullMenu = parseFullMenuForLocation(menuHtml, location);
        res.json({
            ...fullMenu,
            date: date.toISOString(),
            dateStr: date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
        });
        
    } catch (error) {
        console.error('Error in /api/menu/full-menu:', error);
        res.status(500).json({ error: 'Failed to fetch full menu.' });
    }
});

app.post('/api/menu/full-week-report', async (req, res) => {
    try {
        const { favoriteFoods, targetLocations } = req.body;
        if (!favoriteFoods || !targetLocations) {
            return res.status(400).json({ error: 'favoriteFoods and targetLocations are required.' });
        }
        
        const report = {};
        favoriteFoods.forEach(food => {
            report[food] = { food: food, found_days: [] };
        });

        for (let i = 0; i < 8; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            const dateStr = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
            
            const menuHtml = await fetchMenuForDate(dateStr);
            if (!menuHtml) continue;

            for (const food of favoriteFoods) {
                const items = findFoodInHtml(menuHtml, food, targetLocations);
                if (items.length > 0) {
                    report[food].found_days.push({
                        date: date,
                        details: items.join('')
                    });
                }
            }
        }
        
        res.json(Object.values(report));

    } catch (error) {
        console.error('Error in /api/menu/full-week-report:', error);
        res.status(500).json({ error: 'Failed to generate weekly menu report.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
