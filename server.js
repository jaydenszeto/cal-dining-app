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
        if (!response.ok) return null; // Return null on error
        return await response.text();
    } catch (error) {
        console.error(`Error fetching for ${dateStr}:`, error);
        return null;
    }
}

// --- Endpoint to check today's menu ---
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

// --- Endpoint to find the NEXT available day in the week (CORRECTED LOGIC) ---
app.post('/api/menu/week', async (req, res) => {
    try {
        const { favoriteFoods, targetLocations } = req.body;
        if (!favoriteFoods || !targetLocations) {
            return res.status(400).json({ error: 'favoriteFoods and targetLocations are required.' });
        }

        for (let i = 1; i <= 7; i++) { // Check tomorrow through next 7 days
            const date = new Date();
            date.setDate(date.getDate() + i);
            const dateStr = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
            
            const menuHtml = await fetchMenuForDate(dateStr);
            if (!menuHtml) continue;

            const menuText = menuHtml.toLowerCase();

            // This flag will be set to true if we find a food at a specified location.
            let hasMatch = false;

            // Loop through each location the user selected.
            for (const location of targetLocations) {
                const locationIndex = menuText.indexOf(location.toLowerCase());

                // If the location isn't on the menu for this day, skip it.
                if (locationIndex === -1) {
                    continue;
                }
                
                // Find the end of this location's menu section by looking for the start of the next one.
                const nextLocationHeader = '<li class="location-name">';
                const nextLocationIndex = menuText.indexOf(nextLocationHeader, locationIndex + 1);

                // Define the specific chunk of HTML for this one location's menu.
                const searchChunk = nextLocationIndex !== -1 
                    ? menuText.substring(locationIndex, nextLocationIndex) 
                    : menuText.substring(locationIndex);
                
                // Now, only search for the favorite food within that location's chunk.
                for (const food of favoriteFoods) {
                    if (searchChunk.includes(food.toLowerCase())) {
                        hasMatch = true;
                        break; // Found a food, no need to check other foods for this location
                    }
                }

                if (hasMatch) {
                    break; // Found a match, no need to check other locations
                }
            }

            // If we found a valid match, return the data and stop looping.
            if (hasMatch) {
                return res.json({ found: true, date, menuHtml });
            }
        }

        // If the loop completes without finding anything.
        res.json({ found: false });

    } catch (error) {
        console.error('Error in /api/menu/week:', error);
        res.status(500).json({ error: 'Failed to search weekly menu.' });
    }
});


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
