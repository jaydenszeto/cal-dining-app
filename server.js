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

// --- HELPER FUNCTION TO FETCH AND PARSE A SINGLE DAY ---
async function fetchAndParseMenu(dateStr) {
    const formData = new URLSearchParams();
    formData.append('action', AJAX_ACTION);
    formData.append('date', dateStr);
    formData.append('location', '');
    formData.append('mealperiod', '');

    const response = await fetch(BERKELEY_API_URL, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!response.ok) {
        throw new Error(`Berkeley API responded with status: ${response.status}`);
    }
    return response.text();
}

// Endpoint to check a single day (today)
app.post('/api/menu', async (req, res) => {
    try {
        const { date } = req.body;
        if (!date) return res.status(400).json({ error: 'Date is required' });
        const menuHtml = await fetchAndParseMenu(date);
        res.send(menuHtml);
    } catch (error) {
        console.error('Error in /api/menu:', error);
        res.status(500).json({ error: 'Failed to fetch today\'s menu data.' });
    }
});

// --- NEW ENDPOINT TO CHECK THE UPCOMING WEEK ---
app.post('/api/menu/week', async (req, res) => {
    try {
        const { favoriteFoods, targetLocations } = req.body;
        if (!favoriteFoods || !targetLocations) {
            return res.status(400).json({ error: 'Favorite foods and locations are required.' });
        }

        // Loop from tomorrow (i=1) up to 7 days from now
        for (let i = 1; i <= 7; i++) {
            const date = new Date();
            date.setDate(date.getDate() + i);
            const dateStr = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}${date.getDate().toString().padStart(2, '0')}`;
            const dayName = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
            
            const htmlText = await fetchAndParseMenu(dateStr);
            
            // This is a simple server-side DOM parser simulation
            for (const food of favoriteFoods) {
                if (htmlText.toLowerCase().includes(food.toLowerCase())) {
                    // Since we can't parse HTML easily here, we'll let the client find the details.
                    // We found a match for this day, so send it back and stop searching.
                    return res.json({ success: true, date: dayName, html: htmlText });
                }
            }
        }

        // If the loop finishes without finding anything
        return res.json({ success: false, message: 'Nothing found in the next 7 days.' });

    } catch (error) {
        console.error('Error in /api/menu/week:', error);
        res.status(500).json({ error: 'Failed to fetch weekly menu data.' });
    }
});


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

