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

function findFoodInHtml(htmlText, food, targetLocations) {
    const foundItems = [];
    const lowerCaseHtml = htmlText.toLowerCase();
    
    for (const location of targetLocations) {
        let currentIndex = 0;
        const locationMarker = `<span class="cafe-title">${location}</span>`.toLowerCase();

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
    return [...new Set(foundItems)];
}

// ✅ NEW: Endpoint logic now finds ALL occurrences of each food for the week.
app.post('/api/menu/full-week-report', async (req, res) => {
    try {
        const { favoriteFoods, targetLocations } = req.body;
        if (!favoriteFoods || !targetLocations) {
            return res.status(400).json({ error: 'favoriteFoods and targetLocations are required.' });
        }
        
        // Initialize a report structure for each food
        const report = {};
        favoriteFoods.forEach(food => {
            report[food] = { food: food, found_days: [] };
        });

        // Loop through the next 8 days to find all occurrences
        for (let i = 0; i < 8; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            const dateStr = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
            
            const menuHtml = await fetchMenuForDate(dateStr);
            if (!menuHtml) continue;

            // Check for each favorite food on this specific day
            for (const food of favoriteFoods) {
                const items = findFoodInHtml(menuHtml, food, targetLocations);
                if (items.length > 0) {
                    // If found, add this day's details to the food's report
                    report[food].found_days.push({
                        date: date,
                        details: items.join('')
                    });
                }
            }
        }
        
        // Convert the report object to an array for the frontend
        res.json(Object.values(report));

    } catch (error) {
        console.error('Error in /api/menu/full-week-report:', error);
        res.status(500).json({ error: 'Failed to generate weekly menu report.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

