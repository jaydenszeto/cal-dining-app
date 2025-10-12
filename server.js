const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
// Render provides the PORT environment variable
const PORT = process.env.PORT || 3000;

// Use CORS to allow cross-origin requests
app.use(cors());
// Serve the static files from the 'public' folder
app.use(express.static('public'));
// Use express.json() to parse JSON request bodies
app.use(express.json());


// The proxy endpoint
app.post('/api/menu', async (req, res) => {
    const { date } = req.body;

    if (!date) {
        return res.status(400).json({ error: 'Date is required' });
    }

    const BERKELEY_API_URL = "https://dining.berkeley.edu/wp-admin/admin-ajax.php";
    const AJAX_ACTION = 'cald_filter_xml';

    const formData = new URLSearchParams();
    formData.append('action', AJAX_ACTION);
    formData.append('date', date);
    formData.append('location', '');
    formData.append('mealperiod', '');

    try {
        const response = await fetch(BERKELEY_API_URL, {
            method: 'POST',
            body: formData,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        if (!response.ok) {
            throw new Error(`Berkeley API responded with status: ${response.status}`);
        }

        const menuHtml = await response.text();
        res.send(menuHtml); // Send the raw HTML back to the frontend

    } catch (error) {
        console.error('Error fetching from Berkeley API:', error);
        res.status(500).json({ error: 'Failed to fetch menu data.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
