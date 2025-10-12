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

// --- Endpoint to find the NEXT available day in the week ---
app.post('/api/menu/week', async (req, res) => {
    try {
        const { favoriteFoods, targetLocations } = req.body;

        for (let i = 1; i <= 7; i++) { // Check tomorrow through next 7 days
            const date = new Date();
            date.setDate(date.getDate() + i);
            const dateStr = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
            
            const menuHtml = await fetchMenuForDate(dateStr);
            if (!menuHtml) continue;

            // Simple text search on the server
            const menuText = menuHtml.toLowerCase();
            const foundFood = favoriteFoods.find(food => menuText.includes(food.toLowerCase()));

            if (foundFood) {
                // If we find a match, send back the date and the HTML for the frontend to parse properly
                return res.json({ found: true, date, menuHtml });
            }
        }
        res.json({ found: false });
    } catch (error) {
        console.error('Error in /api/menu/week:', error);
        res.status(500).json({ error: 'Failed to search weekly menu.' });
    }
});


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

