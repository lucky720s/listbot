const config = require('../config');
const { isAdmin, isMainAdmin, initPermissions } = require('../utils/permissions');
const { generateListText } = require('../utils/textUtils');
const { updateListText } = require('../utils/messageUtils');

let botInstance;
let state;

function initAdminHandler(bot, sharedState) {
    botInstance = bot;
    state = sharedState;
}

async function statusCommand(msg) {
    if (!isAdmin(msg.from.id)) return;
    botInstance.sendMessage(msg.chat.id, config.messages.listStatus(state.listStatus));
}


async function listToggleCommand(msg, match) {
    if (!isAdmin(msg.from.id)) return;

    const newStatus = match[1];
    state.listStatus = newStatus;
    state.saveListStatus();

    botInstance.sendMessage(msg.chat.id, config.messages.listNow(newStatus));

    if (!isMainAdmin(msg.from.id)) {
        const adminName = state.names[msg.from.id] || `AdminID: ${msg.from.id}`;
        botInstance.sendMessage(config.mainAdminId, config.messages.adminChangedListStatus(adminName, newStatus));
    }
}


async function addAdminCommand(msg, match) {
    if (!isMainAdmin(msg.from.id)) return;

    const newAdminId = match[1].trim();
    if (!/^\d+$/.test(newAdminId)) {
        botInstance.sendMessage(msg.chat.id, "ID администратора должен быть числом.");
        return;
    }

    if (!state.admins.includes(newAdminId)) {
        state.admins.push(newAdminId);
        state.saveAdmins();
        initPermissions(state.admins, config.mainAdminId, config.girlsIds);
        botInstance.sendMessage(msg.chat.id, config.messages.adminAdded(newAdminId));
    } else {
        botInstance.sendMessage(msg.chat.id, config.messages.adminExists(newAdminId));
    }
}

async function removeAdminCommand(msg, match) {
    if (!isMainAdmin(msg.from.id)) return;

    const adminToRemoveId = match[1].trim();
    if (adminToRemoveId === String(config.mainAdminId)) {
        botInstance.sendMessage(msg.chat.id, "Нельзя удалить главного администратора.");
        return;
    }

    const index = state.admins.indexOf(adminToRemoveId);
    if (index !== -1) {
        state.admins.splice(index, 1);
        state.saveAdmins();
        initPermissions(state.admins, config.mainAdminId, config.girlsIds);
        botInstance.sendMessage(msg.chat.id, config.messages.adminRemoved(adminToRemoveId));
    } else {
        botInstance.sendMessage(msg.chat.id, config.messages.adminNotFound(adminToRemoveId));
    }
}

async function adminsCommand(msg) {
    if (!isAdmin(msg.from.id)) return;

    let responseText = config.messages.adminsListTitle;
    if (state.admins.length === 0) {
        responseText += "Список администраторов пуст.";
    } else {
        responseText += state.admins.map(adminId => {
            const name = state.names[adminId] || 'Имя не указано';
            let role = '';
            if (String(adminId) === String(config.mainAdminId)) {
                role = ' ';
            }
            return `${adminId}: ${name}${role}`;
        }).join('\n');
    }
    botInstance.sendMessage(msg.chat.id, responseText);
}

async function showAllListsCommand(msg) {
    if (!isMainAdmin(msg.from.id)) return;

    if (Object.keys(state.lists).length === 0) {
        botInstance.sendMessage(msg.chat.id, config.messages.noActiveLists);
        return;
    }

    for (const listKey in state.lists) {
        const listData = state.lists[listKey];
        const text = `Ключ: ${listKey}\nЧат ID: ${listData.chat_id}\nТип: ${listData.type}\nСообщение ID: ${listData.message_id}\n---\n${generateListText(listData, state)}`;
        if (text.length > 4096) {
            await botInstance.sendMessage(msg.chat.id, text.substring(0, 4090) + "\n(сообщение было обрезано)");
        } else {
            await botInstance.sendMessage(msg.chat.id, text);
        }
        await new Promise(resolve => setTimeout(resolve, 200));
    }
}

async function deleteListCommand(msg, match) {
    if (!isMainAdmin(msg.from.id)) return;

    const listIdToDelete = match[1].trim();
    let listKeyToDelete = `list_${listIdToDelete}`;

    if (state.lists[listKeyToDelete]) {
        try {
            if (state.lists[listKeyToDelete].chat_id && state.lists[listKeyToDelete].message_id) {
                 await botInstance.deleteMessage(state.lists[listKeyToDelete].chat_id, state.lists[listKeyToDelete].message_id).catch(e => console.warn("Не удалось удалить сообщение основного списка: ", e.message));
            }
             if (state.lists[listKeyToDelete].chat_id_admin && state.lists[listKeyToDelete].message_id_admin) {
                 await botInstance.deleteMessage(state.lists[listKeyToDelete].chat_id_admin, state.lists[listKeyToDelete].message_id_admin).catch(e => console.warn("Не удалось удалить сообщение списка у админа: ", e.message));
            }
        } catch (e) {
            console.warn(`Не удалось открепить/удалить сообщение для списка ${listKeyToDelete}:`, e.message);
        }
        delete state.lists[listKeyToDelete];
        state.saveLists();
        botInstance.sendMessage(msg.chat.id, config.messages.listDeleted(listKeyToDelete));
        return;
    }

    listKeyToDelete = `team_${listIdToDelete}`;
    if (state.lists[listKeyToDelete]) {
         try {
            if (state.lists[listKeyToDelete].chat_id && state.lists[listKeyToDelete].message_id) {
                 await botInstance.deleteMessage(state.lists[listKeyToDelete].chat_id, state.lists[listKeyToDelete].message_id).catch(e => console.warn("Не удалось удалить сообщение основного списка команды: ", e.message));
            }
             if (state.lists[listKeyToDelete].chat_id_admin && state.lists[listKeyToDelete].message_id_admin) {
                 await botInstance.deleteMessage(state.lists[listKeyToDelete].chat_id_admin, state.lists[listKeyToDelete].message_id_admin).catch(e => console.warn("Не удалось удалить сообщение списка команды у админа: ", e.message));
            }
        } catch (e) {
            console.warn(`Не удалось открепить/удалить сообщение для команды ${listKeyToDelete}:`, e.message);
        }
        delete state.lists[listKeyToDelete];
        state.saveLists();
        botInstance.sendMessage(msg.chat.id, config.messages.listDeleted(listKeyToDelete));
    } else {
        botInstance.sendMessage(msg.chat.id, `Список или команда с ID "${listIdToDelete}" не найден.`);
    }
}

async function setTextCommand(msg, match) {
    if (!isAdmin(msg.from.id)) return;
    const description = match[1].trim();
    if (!msg.reply_to_message) {
        botInstance.sendMessage(msg.chat.id, "Команда /text должна быть ответом на сообщение со списком.");
        return;
    }
    const listKey = findActiveListKey(msg, state.lists);
    if (!listKey || !state.lists[listKey]) {
        botInstance.sendMessage(msg.chat.id, config.messages.listOrTeamNotFound);
        return;
    }

    state.lists[listKey].description = description;
    await updateListText(listKey);
    botInstance.sendMessage(msg.chat.id, "Описание списка обновлено.");
}

module.exports = {
    initAdminHandler,
    statusCommand,
    listToggleCommand,
    addAdminCommand,
    removeAdminCommand,
    adminsCommand,
    showAllListsCommand,
    deleteListCommand,
    setTextCommand
};
