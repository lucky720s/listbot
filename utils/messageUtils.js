const fs = require('fs');
const path = require('path');
const config = require('../config');
const { generateListText } = require('./textUtils');

let botInstance;
let globalState;

function initMessageUtils(bot, state) {
    botInstance = bot;
    globalState = state;
}

function saveLastCallTimestamp() {
    const timestamp = Date.now();
    const filePath = path.resolve(__dirname, '..', config.dataPaths.lastCallTimestamp);
    const dirPath = path.dirname(filePath);
    try {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
        fs.writeFileSync(filePath, JSON.stringify({ lastCall: timestamp }));
    } catch (error) {
        console.error('Ошибка сохранения временной метки:', error);
    }
}

function getLastCallTimestamp() {
    const filePath = path.resolve(__dirname, '..', config.dataPaths.lastCallTimestamp);
    try {
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            return data.lastCall;
        }
    } catch (error) {
        console.error('Ошибка чтения временной метки:', error);
    }
    return 0;
}

async function mentionUsers(bot, chatId) {
    try {
        const admins = await bot.getChatAdministrators(chatId);
        const usersToMention = admins
            .map(admin => admin.user)
            .filter(user => !user.is_bot)
            .sort((a, b) => a.id - b.id);

        if (usersToMention.length === 0) {
            return;
        }

        for (let i = 0; i < usersToMention.length; i += config.MENTION_CHUNK_SIZE) {
            const chunk = usersToMention.slice(i, i + config.MENTION_CHUNK_SIZE);
            const mentions = chunk.map(user => {
                const emoji = config.EMOJI_LIST[Math.floor(Math.random() * config.EMOJI_LIST.length)];
                return `[${emoji}](tg://user?id=${user.id})`;
            }).join(' ');

            if (mentions) {
                await bot.sendMessage(chatId, mentions, { parse_mode: 'Markdown' });
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    } catch (error) {
        console.error('Ошибка при упоминании участников:', error.message);
    }
}

async function updateListText(listKey) {
    if (!botInstance || !globalState || !globalState.lists[listKey]) {
        console.error('updateListText: Бот или данные списка не инициализированы.', { listKey, botInstanceExists: !!botInstance, globalStateExists: !!globalState });
        return;
    }

    const listData = globalState.lists[listKey];
    const newText = generateListText(listData, globalState);

    try {
        if (listData.chat_id && listData.message_id) {
            await botInstance.editMessageText(newText, {
                chat_id: listData.chat_id,
                message_id: listData.message_id,
                parse_mode: 'Markdown'
            }).catch(err => console.error(`Ошибка редактирования сообщения в основном чате ${listData.chat_id} (msg_id: ${listData.message_id}):`, err.response ? err.response.body : err.message));
        }

        if (listData.chat_id_admin && listData.message_id_admin) {
            await botInstance.editMessageText(newText, {
                chat_id: listData.chat_id_admin,
                message_id: listData.message_id_admin,
                parse_mode: 'Markdown'
            }).catch(err => console.error(`Ошибка редактирования сообщения в чате админа ${listData.chat_id_admin} (msg_id: ${listData.message_id_admin}):`, err.response ? err.response.body : err.message));
        }
        globalState.saveLists();
    } catch (error) {
    }
}

function findActiveListKey(msg, lists) {
    if (!msg.reply_to_message) {
        return null;
    }
    const repliedMessageId = msg.reply_to_message.message_id;
    const repliedChatId = msg.reply_to_message.chat.id;

    for (const listKey in lists) {
        const list = lists[listKey];
        if ((list.message_id === repliedMessageId && list.chat_id === repliedChatId) ||
            (list.message_id_admin === repliedMessageId && list.chat_id_admin === repliedChatId)) {
            return listKey;
        }
    }
    return null;
}

async function updateAllMessagesWithNameChange(oldName, newName) {
    if (!botInstance || !globalState || !globalState.lists || !globalState.saveLists) {
        console.error('updateAllMessagesWithNameChange: Бот или глобальное состояние не инициализированы.');
        return;
    }
    let changed = false;
    for (const listKey in globalState.lists) {
        const listData = globalState.lists[listKey];
        let listModified = false;

        for (let i = 0; i < listData.list_temp.length; i++) {
            if (listData.list_temp[i]) {
                const originalLength = listData.list_temp[i].length;
                listData.list_temp[i] = listData.list_temp[i].map(nameInList => {
                    if (nameInList === oldName && !nameInList.startsWith("Тема:")) {
                        return newName;
                    }
                    return nameInList;
                });
                if (listData.list_temp[i].length !== originalLength || listData.list_temp[i].includes(newName)) {
                    if (listData.list_temp[i].includes(newName) && !listData.list_temp[i].includes(oldName) && originalLength > 0) {
                         listModified = true;
                    } else {
                        const tempArrayBeforeMap = [...(globalState.lists[listKey].list_temp_snapshot_before_map?.[i] || [])];
                        if (tempArrayBeforeMap.includes(oldName)) {
                            listModified = true;
                        }
                    }
                }
            }
        }

        if (listModified) {
            changed = true;
            try {
                const newText = generateListText(listData, globalState);
                if (listData.message_id && listData.chat_id) {
                    await botInstance.editMessageText(newText, {
                        chat_id: listData.chat_id,
                        message_id: listData.message_id,
                        parse_mode: 'Markdown'
                    });
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
                if (listData.message_id_admin && listData.chat_id_admin) {
                    await botInstance.editMessageText(newText, {
                        chat_id: listData.chat_id_admin,
                        message_id: listData.message_id_admin,
                        parse_mode: 'Markdown'
                    });
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            } catch (error) {
                console.error(`Не удалось изменить сообщение для ${listKey} при смене имени:`, error.response ? error.response.body : error.message);
            }
        }
    }

    if (changed) {
        globalState.saveLists();
    }
}


module.exports = {
    initMessageUtils,
    saveLastCallTimestamp,
    getLastCallTimestamp,
    mentionUsers,
    updateListText,
    findActiveListKey,
    updateAllMessagesWithNameChange
};
