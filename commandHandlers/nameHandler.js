const config = require('../config');
const { updateAllMessagesWithNameChange } = require('../utils/messageUtils');
const { isMainAdmin } = require('../utils/permissions');

let botInstance;
let state;

function initNameHandler(bot, sharedState) {
    botInstance = bot;
    state = sharedState;
}

async function nameCommand(msg, match) {
    const chatId = msg.chat.id;
    const userIdFromCommand = msg.from.id.toString();
    let targetUserId = userIdFromCommand;
    let newName;

    const args = match[1].trim().split(/\s+/);

    if (args.length >= 2 && /^\d+$/.test(args[0]) && isMainAdmin(userIdFromCommand)) {
        targetUserId = args[0];
        newName = args.slice(1).join(" ");
    } else if (args.length >= 1) {
        newName = args.join(" ");
    } else {
        botInstance.sendMessage(chatId, "Использование: /name [ID пользователя (только для гл. админа)] <Новое Имя>");
        return;
    }

    if (newName.length > 20) {
        botInstance.sendMessage(chatId, "Имя не должно быть длиннее 20 символов.");
        return;
    }

    if (!config.namePattern.test(newName)) {
        botInstance.sendMessage(chatId, config.messages.nameInvalid);
        return;
    }

    const existingUserIdWithName = Object.keys(state.names).find(id => state.names[id] === newName && id !== targetUserId);
    if (existingUserIdWithName) {
        botInstance.sendMessage(chatId, config.messages.nameTaken(newName));
        return;
    }

    const oldName = state.names[targetUserId] || 'Неизвестно';
    state.names[targetUserId] = newName;
    state.saveNames();

    botInstance.sendMessage(chatId, `Имя для ID ${targetUserId} (ранее "${oldName}") успешно обновлено на "${newName}".`);

    if (oldName !== 'Неизвестно' && oldName !== newName) {
        await updateAllMessagesWithNameChange(oldName, newName);
    }
}

async function namesCommand(msg) {
    const chatId = msg.chat.id;
    if (Object.keys(state.names).length === 0) {
        botInstance.sendMessage(chatId, config.messages.namesListEmpty);
        return;
    }

    let namesList = "";
    for (const userId in state.names) {
        namesList += `${userId}: ${state.names[userId]}\n`;
    }

    if (namesList.length > 4096) {
        const parts = [];
        while (namesList.length > 0) {
            parts.push(namesList.substring(0, 4000));
            namesList = namesList.substring(4000);
        }
        for (const part of parts) {
            await botInstance.sendMessage(chatId, part);
        }
    } else {
        await botInstance.sendMessage(chatId, namesList);
    }
}

module.exports = {
    initNameHandler,
    nameCommand,
    namesCommand
};
