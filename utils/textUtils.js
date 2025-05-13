const config = require('../config');

function extractNumbers(input) {
    if (!input || typeof input !== 'string') return [];
    input = input.replace(/[.\s]/g, ',');
    const parts = input.split(',');
    const result = new Set();

    parts.forEach(part => {
        const ranges = part.split('-').map(Number);

        if (ranges.length === 1) {
            const num = ranges[0];
            if (!isNaN(num) && num >= 1 && num <= config.MAX_LIST_POSITIONS) {
                result.add(num);
            }
        } else if (ranges.length === 2) {
            const start = Math.max(isNaN(ranges[0]) ? Infinity : ranges[0], 1);
            const end = Math.min(isNaN(ranges[1]) ? -Infinity : ranges[1], config.MAX_LIST_POSITIONS);
            if (start <= end) {
                for (let i = start; i <= end; i++) {
                    result.add(i);
                }
            }
        }
    });

    return Array.from(result).sort((a, b) => a - b);
}

function generateListText(listData) {
    if (!listData || !listData.list_temp || !Array.isArray(listData.list_temp)) {
        let fallbackText = "";
        for (let i = 0; i < config.MAX_LIST_POSITIONS; i++) {
            fallbackText += `${i + 1}.\n`;
        }
        return fallbackText.trim() || " ";
    }

    let builtTextLines = [];
    let contentFoundInListTemp = false;

    for (let i = 0; i < Math.min(listData.list_temp.length, config.MAX_LIST_POSITIONS); i++) {
        const position = i + 1;
        const usersInPosition = listData.list_temp[i] || [];

        const userNames = usersInPosition.filter(user => typeof user === 'string' && !user.startsWith("Тема:"));
        const topics = usersInPosition.filter(user => typeof user === 'string' && user.startsWith("Тема:"));

        let positionContentString = "";
        if (userNames.length > 0) {
            positionContentString += userNames.join(' ');
            contentFoundInListTemp = true;
        }
        if (topics.length > 0) {
            positionContentString += (positionContentString ? ' ' : '') + topics.join(' ');
            contentFoundInListTemp = true;
        }

        builtTextLines.push(`${position}. ${positionContentString.trim()}`);
    }

    let finalText = builtTextLines.join('\n');

    const descriptionText = listData.description ? listData.description.trim() : "";

    if (descriptionText) {
        finalText += `\n\n${descriptionText}`;
    }

    if (finalText.trim() === "" && !contentFoundInListTemp && !descriptionText) {
        finalText = "";
        for (let i = 0; i < config.MAX_LIST_POSITIONS; i++) {
            if (i < listData.list_temp.length || i < config.MAX_LIST_POSITIONS) {
                 finalText += `${i + 1}.\n`;
            }
        }
    }

    return finalText.trim() || " ";
}


module.exports = { extractNumbers, generateListText };
