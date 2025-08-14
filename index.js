const express = require('express');
const puppeteer = require('puppeteer');
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

let lastStatus = { success: false, timestamp: null };

async function scrape() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    try {
        await page.goto('https://www.coingecko.com/en/coins/trending', { timeout: 60000 });
        await page.waitForSelector('table tbody tr');

        const data = await page.$$eval('table tbody tr', rows =>
            rows.map(row => {
                const cols = row.querySelectorAll('td');
                return {
                    name: cols[2]?.innerText.trim(),
                    price: cols[3]?.innerText.trim(),
                    volume: cols[4]?.innerText.trim(),
                    change: cols[5]?.innerText.trim(),
                };
            })
        );

        const workbook = new ExcelJS.Workbook();
        const date = new Date();
        const fileName = `cg_gainers_${date.toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;
        const fullPath = path.join(DATA_DIR, fileName);
        const sheetName = date.toISOString().slice(11, 16).replace(':', '');

        if (fs.existsSync(fullPath)) {
            await workbook.xlsx.readFile(fullPath);
        }

        const sheet = workbook.addWorksheet(sheetName);
        sheet.columns = [
            { header: 'Name', key: 'name' },
            { header: 'Price', key: 'price' },
            { header: 'Volume', key: 'volume' },
            { header: '24h Change', key: 'change' },
        ];
        data.forEach(d => sheet.addRow(d));

        await workbook.xlsx.writeFile(fullPath);

        lastStatus = { success: true, timestamp: new Date().toISOString() };
        console.log(`✅ Saved to ${fileName} → ${sheetName}`);
    } catch (err) {
        console.error('❌ Scan failed:', err);
        lastStatus = { success: false, timestamp: new Date().toISOString(), error: err.message };
    } finally {
        await browser.close();
    }
}

app.get('/status', (req, res) => {
    res.json(lastStatus);
});

app.get('/download/:filename', (req, res) => {
    const file = path.join(DATA_DIR, req.params.filename);
    if (fs.existsSync(file)) {
        res.download(file);
