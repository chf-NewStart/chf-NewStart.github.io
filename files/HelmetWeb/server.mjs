import express from 'express';
import fetch from 'node-fetch';

const app = express();
const PORT = 3000;


// Serve static files from the "public" directory
app.use(express.static('public'));

// Proxy endpoint that fetches the CSV data from Google Sheets
app.get('/fetch-csv', async (req, res) => {
    const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ_ie6VHw1_JL0GL8tcpf_pdggG3Cl_U8qm135_lkuQaHgph5wXjJA50FzTqgbUOC87ECWrv5ZHCFk3/pub?gid=0&single=true&output=csv';

    try {
        const response = await fetch(csvUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const csv = await response.text();
        res.type('text/csv');
        res.send(csv);
    } catch (error) {
        console.error(error);
        res.status(500).send("Error fetching the CSV data.");
    }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
