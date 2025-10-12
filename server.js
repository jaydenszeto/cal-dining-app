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

    const response = await fetch(BERKELEY_API_URL, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!response.ok) {
        console.error(`API error for date ${dateStr}: ${response.statusText}`);
        return null; // Return null on error instead of throwing
    }
    return response.text();
}

// Endpoint to check a single day (today)
app.post('/api/menu', async (req, res) => {
    try {
        const { date } = req.body;
        if (!date) return res.status(400).json({ error: 'Date is required' });
        const menuHtml = await fetchMenuForDate(date);
        res.send(menuHtml);
    } catch (error) {
        console.error('Error in /api/menu:', error);
        res.status(500).json({ error: 'Failed to fetch today\'s menu data.' });
    }
});

// --- NEW ROBUST ENDPOINT ---
// Fetches raw HTML for multiple dates at once
app.post('/api/menu/batch', async (req, res) => {
    try {
        const { dates } = req.body;
        if (!Array.isArray(dates) || dates.length === 0) {
            return res.status(400).json({ error: 'An array of dates is required.' });
        }

        const promises = dates.map(dateStr => fetchMenuForDate(dateStr));
        const results = await Promise.all(promises);

        const menuData = {};
        dates.forEach((dateStr, index) => {
            menuData[dateStr] = results[index];
        });

        res.json(menuData);
    } catch (error) {
        console.error('Error in /api/menu/batch:', error);
        res.status(500).json({ error: 'Failed to fetch batch menu data.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

