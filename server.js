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

// --- Helper function to fetch menu for a single date ---
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
 * A simple, dependency-free HTML parser that runs on the server.
 * It finds all occurrences of a specific food within the menus of target locations.
 * @param {string} htmlText - The raw HTML from the dining site.
 * @param {string} food - The single food keyword to search for (e.g., "curry").
 * @param {string[]} targetLocations - An array of dining hall names (e.g., ["Crossroads"]).
 * @returns {string[]} An array of formatted HTML list items for display.
 */
function findFoodInHtml(htmlText, food, targetLocations) {
    const foundItems = [];
    const lowerCaseHtml = htmlText.toLowerCase();
    
    for (const location of targetLocations) {
        let currentIndex = 0;
        const locationMarker = `<span class="cafe-title">${location}</span>`.toLowerCase();

        // Find each instance of the location on the page
        while ((currentIndex = lowerCaseHtml.indexOf(locationMarker, currentIndex)) !== -1) {
            const endOfLocationBlock = lowerCaseHtml.indexOf('<li class="location-name"', currentIndex + 1);
            const locationHtml = htmlText.substring(currentIndex, endOfLocationBlock === -1 ? undefined : endOfLocationBlock);
            
            const mealRegex = /<li class="preiod-name.*?<span>(.*?)<\/span>.*?<\/li>/gs;
            let mealMatch;
            while ((mealMatch = mealRegex.exec(locationHtml)) !== null) {
                const mealName = mealMatch[1].replace(/Fall - /g, '').replace(/<span.*/, '').trim();
                const mealHtml = mealMatch[0];

                const recipeRegex = /<li class="recip.*?<span>(.*?)<\/span>/g;
                let recipeMatch;
                while ((recipeMatch = recipeRegex.exec(mealHtml)) !== null) {
                    const recipeName = recipeMatch[1].trim();
                    if (recipeName.toLowerCase().includes(food.toLowerCase())) {
                        foundItems.push(`<li><strong>${recipeName}</strong> at ${location} (${mealName})</li>`);
                    }
                }
            }
            currentIndex = currentIndex + locationMarker.length;
        }
    }
    return [...new Set(foundItems)]; // Return unique items
}

// ✅ NEW: The primary endpoint to handle the entire weekly lookup
app.post('/api/menu/full-week-report', async (req, res) => {
    try {
        const { favoriteFoods, targetLocations } = req.body;
        if (!favoriteFoods || !targetLocations) {
            return res.status(400).json({ error: 'favoriteFoods and targetLocations are required.' });
        }
        
        const results = [];
        const foundFoods = new Set();

        // Loop through the next 8 days (today + 7 more)
        for (let i = 0; i < 8; i++) {
            // If we've found every food, we can stop early.
            if (foundFoods.size === favoriteFoods.length) break;

            const date = new Date();
            date.setDate(date.getDate() + i);
            const dateStr = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
            
            const menuHtml = await fetchMenuForDate(dateStr);
            if (!menuHtml) continue;

            // Check for any foods we haven't found yet
            for (const food of favoriteFoods) {
                if (!foundFoods.has(food)) {
                    const items = findFoodInHtml(menuHtml, food, targetLocations);
                    if (items.length > 0) {
                        results.push({
                            food: food,
                            status: i === 0 ? 'today' : 'upcoming',
                            date: date,
                            details: items.join('')
                        });
                        foundFoods.add(food);
                    }
                }
            }
        }

        // For any foods that were never found, add a "not_found" status
        for (const food of favoriteFoods) {
            if (!foundFoods.has(food)) {
                results.push({ food: food, status: 'not_found' });
            }
        }

        res.json(results);

    } catch (error) {
        console.error('Error in /api/menu/full-week-report:', error);
        res.status(500).json({ error: 'Failed to generate weekly menu report.' });
    }
});


// --- Old endpoints are no longer used by the new frontend but are kept for reference ---
app.post('/api/menu', async (req, res) => {
    try {
        const { date } = req.body;
        if (!date) return res.status(400).json({ error: 'Date is required' });
        const menuHtml = await fetchMenuForDate(date);
        res.send(menuHtml);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch menu data.' });
    }
});
app.post('/api/menu/week', async (req, res) => res.status(404).json({error: 'This endpoint is deprecated.'}));


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
