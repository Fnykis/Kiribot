const fs = require('fs');
const path = require('path');

function createConcertsRoute({ activeDir, parseEventDate, logger = () => {} }) {
    return function concertsRoute(req, res) {
        let files;
        try {
            files = fs.readdirSync(activeDir);
        } catch {
            return res.json([]);
        }

        const concerts = [];
        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            let data;
            try {
                data = JSON.parse(fs.readFileSync(path.join(activeDir, file), 'utf8'));
            } catch (err) {
                logger(`concerts route: skipping ${file}:`, err.message);
                continue;
            }
            if (!data || !data.id || !data.name || !data.date) continue;
            concerts.push({ concertId: data.id, name: data.name, date: data.date });
        }

        concerts.sort((a, b) => {
            const da = parseEventDate(a.date);
            const db = parseEventDate(b.date);
            if (!da && !db) return 0;
            if (!da) return 1;
            if (!db) return -1;
            return da.getTime() - db.getTime();
        });

        return res.json(concerts);
    };
}

module.exports = createConcertsRoute;
