const fs = require('fs');
const path = require('path');

function loadData(filename, defaultValue) {
    const filePath = path.resolve(__dirname, filename);
    try {
        if (fs.existsSync(filePath)) {
            const fileData = fs.readFileSync(filePath, 'utf8');
            if (fileData.trim() === '') {
                return defaultValue;
            }
            return JSON.parse(fileData);
        }
    } catch (error) {
        console.error(`Ошибка загрузки данных из ${filename}:`, error);
    }
    return defaultValue;
}

function saveData(filename, data) {
    const filePath = path.resolve(__dirname, filename);
    const dirPath = path.dirname(filePath);
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error(`Ошибка сохранения данных в ${filename}:`, error);
    }
}

module.exports = { loadData, saveData };
