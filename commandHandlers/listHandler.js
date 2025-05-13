const config = require('../config');
const { isAdmin, isGirl, canManageUser } = require('../utils/permissions');
const { extractNumbers, generateListText } = require('../utils/textUtils');
const { updateListText, findActiveListKey, mentionUsers, getLastCallTimestamp, saveLastCallTimestamp } = require('../utils/messageUtils');
const { delay } = require('../utils/commonUtils');

let botInstance;
let state;

function initListHandler(bot, sharedState) {
    botInstance = bot;
    state = sharedState;
}

async function handleCreateList(msg, type) {
    if (state.listStatus === 'off') {
        return;
    }

    const listKey = `${type}_${msg.message_id}`;

    try {
        const lastCall = getLastCallTimestamp();
        if (Date.now() - lastCall > config.MENTION_COOLDOWN) {
            saveLastCallTimestamp();
            await mentionUsers(botInstance, msg.chat.id);
            await delay(0.2);
        }
    } catch (mentionError) {
        console.error(`Ошибка при вызове mentionUsers для чата ${msg.chat.id}:`, mentionError.message || mentionError);
    }

    if (!state.lists[listKey]) {
        state.lists[listKey] = {
            list_temp: Array(config.MAX_LIST_POSITIONS).fill(null).map(() => []),
            user_positions: {},
            chat_id: msg.chat.id,
            message_id: null,
            chat_id_admin: config.mainAdminId,
            message_id_admin: null,
            type: type,
            description: ''
        };
    }

    try {
        state.saveLists();
    } catch (saveError) {
        console.error(`Критическая ошибка: не удалось сохранить начальный список ${listKey}:`, saveError.message || saveError);
        await botInstance.sendMessage(msg.chat.id, config.messages.genericError + " (Ошибка сохранения данных)");
        return;
    }

    const text = generateListText(state.lists[listKey]);
    if (!text || text.trim() === "") {
        console.error(`Критическая ошибка: generateListText вернул пустой текст для ${listKey}`);
        await botInstance.sendMessage(msg.chat.id, config.messages.genericError + " (Ошибка генерации текста списка)");
        if (state.lists[listKey] && state.lists[listKey].message_id === null) {
            delete state.lists[listKey];
            try { state.saveLists(); } catch (e) { console.error("Ошибка при удалении некорректного списка:", e); }
        }
        return;
    }

    let sentMsg;
    try {
        sentMsg = await botInstance.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
        state.lists[listKey].message_id = sentMsg.message_id;
        state.saveLists();

        try {
            await botInstance.pinChatMessage(msg.chat.id, sentMsg.message_id, { disable_notification: false });
        } catch (pinError) {
            console.error(`Ошибка при закреплении сообщения ${sentMsg.message_id} в чате ${msg.chat.id}:`, pinError.message || pinError);
        }

        let sentMsgAdmin;
        try {
            const adminMessageText = `Создан новый список/команда: ${type}\nЧат: ${msg.chat.title || msg.chat.id} (ID: ${msg.chat.id})\nКлюч списка: ${listKey}\n\n${text}`;
            sentMsgAdmin = await botInstance.sendMessage(config.mainAdminId, adminMessageText, { parse_mode: 'Markdown' });
            state.lists[listKey].message_id_admin = sentMsgAdmin.message_id;
            try {
                state.saveLists();
            } catch (saveAdminMsgIdError) {
                console.error(`Ошибка при сохранении message_id_admin для списка ${listKey}:`, saveAdminMsgIdError.message || saveAdminMsgIdError);
            }
        } catch (adminError) {
            console.error(`Ошибка при отправке сообщения главному администратору (ID: ${config.mainAdminId}) для списка ${listKey}:`, adminError.message || adminError);
        }

    } catch (mainChatError) {
        console.error(`Ошибка при отправке/обработке списка (${type}) в основном чате (${msg.chat.id}):`, mainChatError.message || mainChatError);
        await botInstance.sendMessage(msg.chat.id, config.messages.genericError);
        if (state.lists[listKey]) {
            delete state.lists[listKey];
            try { state.saveLists(); } catch (e) { console.error("Ошибка при удалении списка после сбоя отправки:", e); }
        }
    }
}

async function listCommand(msg) {
    await handleCreateList(msg, 'list');
}

async function teamCommand(msg) {
    await handleCreateList(msg, 'team');
}

async function handleNumericOrTextListInput(msg) {
    if (!msg.reply_to_message || !msg.text) return;

    const listKey = findActiveListKey(msg, state.lists);
    if (!listKey || !state.lists[listKey]) {
        return;
    }

    const listData = state.lists[listKey];
    const userId = String(msg.from.id);
    const userName = state.names[userId] || `User_${userId}`;

    const textParts = msg.text.trim().split(/\s+/);
    const firstPart = textParts[0];

    if (firstPart.toLowerCase() === 't' && textParts.length > 1) {
        const topicInput = textParts.slice(1).join(' ').trim();
        const userCurrentPosition = listData.user_positions[userId];

        if (!userCurrentPosition) {
            return;
        }

        const positionIndex = userCurrentPosition - 1;
        if (!listData.list_temp[positionIndex]) {
            listData.list_temp[positionIndex] = [];
        }

        listData.list_temp[positionIndex] = listData.list_temp[positionIndex].filter(entry =>
            !(typeof entry === 'string' && entry.startsWith("Тема:"))
        );

        if (topicInput !== "0") {
            const topicText = `Тема: ${topicInput}`;
            const isTopicTakenInThisList = listData.list_temp.some((posArray, idx) =>
                idx !== positionIndex && Array.isArray(posArray) && posArray.includes(topicText)
            );

            if (isTopicTakenInThisList) {
                await botInstance.sendMessage(msg.chat.id, config.messages.topicTaken);
                return;
            }
            listData.list_temp[positionIndex].push(topicText);
        }
        await updateListText(listKey);
        return;
    }

    const potentialNumbers = extractNumbers(firstPart);
    let targetPosition = parseInt(firstPart, 10);

    if (potentialNumbers.length > 0 && potentialNumbers.length <= 4) {
        if (isGirl(userId) && potentialNumbers.length === 4 && listData.type === 'list') {
            config.girlsIds.forEach(girlId => {
                const girlIdStr = String(girlId);
                if (listData.user_positions[girlIdStr]) {
                    const oldPosIdx = listData.user_positions[girlIdStr] - 1;
                    if (listData.list_temp[oldPosIdx] && Array.isArray(listData.list_temp[oldPosIdx])) {
                        listData.list_temp[oldPosIdx] = listData.list_temp[oldPosIdx].filter(name => name !== state.names[girlIdStr]);
                        listData.list_temp[oldPosIdx] = listData.list_temp[oldPosIdx].filter(entry => !(typeof entry === 'string' && entry.startsWith("Тема:")));
                    }
                    delete listData.user_positions[girlIdStr];
                }
            });

            potentialNumbers.forEach((pos, index) => {
                if (index < config.girlsIds.length) {
                    const currentGirlId = String(config.girlsIds[index]);
                    const currentGirlName = state.names[currentGirlId];
                    if (currentGirlName && pos >= 1 && pos <= config.MAX_LIST_POSITIONS) {
                        let actualPos = pos;
                        if (!listData.list_temp[actualPos - 1]) listData.list_temp[actualPos - 1] = [];

                        while (actualPos <= config.MAX_LIST_POSITIONS &&
                               listData.list_temp[actualPos - 1].length >= config.MAX_USERS_PER_POSITION_LIST &&
                               !listData.list_temp[actualPos - 1].includes(currentGirlName)
                              ) {
                            actualPos++;
                            if (actualPos <= config.MAX_LIST_POSITIONS && !listData.list_temp[actualPos - 1]) {
                                listData.list_temp[actualPos - 1] = [];
                            } else if (actualPos > config.MAX_LIST_POSITIONS) break;
                        }

                        if (actualPos <= config.MAX_LIST_POSITIONS) {
                             const actualPosIdx = actualPos - 1;
                             if (!listData.list_temp[actualPosIdx].includes(currentGirlName)) {
                                listData.list_temp[actualPosIdx].push(currentGirlName);
                             }
                             listData.user_positions[currentGirlId] = actualPos;
                        }
                    }
                }
            });
            await updateListText(listKey);
            return;
        }
    }

    if (!isNaN(targetPosition) && targetPosition >= 0 && targetPosition <= config.MAX_LIST_POSITIONS) {
        let userToModifyId = userId;
        let userToModifyName = userName;
        let isAdminAction = false;

        if (textParts.length > 1 && isAdmin(userId)) {
            const nameArg = textParts.slice(1).join(" ");
            if (!nameArg.startsWith('@')) {
                const foundUserId = Object.keys(state.names).find(id => state.names[id] === nameArg);
                if (foundUserId) {
                    if (!canManageUser(userId, foundUserId)) {
                         await botInstance.sendMessage(msg.chat.id, config.messages.cannotManageGirl);
                         return;
                    }
                    userToModifyId = foundUserId;
                    userToModifyName = nameArg;
                    isAdminAction = true;
                } else if (textParts.length > 1 && !(msg.entities && msg.entities.some(e => e.type === 'mention' || e.type === 'text_mention'))) {
                     await botInstance.sendMessage(msg.chat.id, `Пользователь с именем "${nameArg}" не найден в базе имен. Для @username используйте упоминание.`);
                     return;
                }
            }
        }

        if (targetPosition === 0) {
            if (listData.user_positions[userToModifyId]) {
                const oldPosIdx = listData.user_positions[userToModifyId] - 1;
                if (listData.list_temp[oldPosIdx] && Array.isArray(listData.list_temp[oldPosIdx])) {
                    listData.list_temp[oldPosIdx] = listData.list_temp[oldPosIdx].filter(name => name !== userToModifyName);
                    listData.list_temp[oldPosIdx] = listData.list_temp[oldPosIdx].filter(entry =>
                        !(typeof entry === 'string' && entry.startsWith("Тема:"))
                    );
                }
                delete listData.user_positions[userToModifyId];
                await updateListText(listKey);
            }
            return;
        }

        if (targetPosition > 0) {
            const posIdx = targetPosition - 1;

            if (listData.user_positions[userToModifyId] && listData.user_positions[userToModifyId] !== targetPosition) {
                const oldPosIdx = listData.user_positions[userToModifyId] - 1;
                if (listData.list_temp[oldPosIdx] && Array.isArray(listData.list_temp[oldPosIdx])) {
                    listData.list_temp[oldPosIdx] = listData.list_temp[oldPosIdx].filter(name => name !== userToModifyName);
                    listData.list_temp[oldPosIdx] = listData.list_temp[oldPosIdx].filter(entry => !(typeof entry === 'string' && entry.startsWith("Тема:")));
                }
            }

            if (!listData.list_temp[posIdx] || !Array.isArray(listData.list_temp[posIdx])) {
                listData.list_temp[posIdx] = [];
            }

            const maxUsers = listData.type === 'list' ? config.MAX_USERS_PER_POSITION_LIST : config.MAX_USERS_PER_POSITION_TEAM;

            if (listData.type === 'list') {
                let actualPos = targetPosition;
                if (!listData.list_temp[actualPos - 1]) listData.list_temp[actualPos - 1] = [];

                if (!isAdminAction || (isAdminAction && userToModifyId === userId)) {
                    while (actualPos <= config.MAX_LIST_POSITIONS &&
                           listData.list_temp[actualPos - 1].length >= maxUsers &&
                           !listData.list_temp[actualPos - 1].includes(userToModifyName)
                          ) {
                        actualPos++;
                        if (actualPos <= config.MAX_LIST_POSITIONS && !listData.list_temp[actualPos - 1]) {
                            listData.list_temp[actualPos - 1] = [];
                        } else if (actualPos > config.MAX_LIST_POSITIONS) break;
                    }
                }

                if (actualPos > config.MAX_LIST_POSITIONS) {
                    await botInstance.sendMessage(msg.chat.id, "Нет свободных мест, начиная с указанной позиции.");
                    return;
                }
                const actualPosIdx = actualPos - 1;
                if (!listData.list_temp[actualPosIdx]) listData.list_temp[actualPosIdx] = [];

                if (isAdminAction && listData.list_temp[actualPosIdx].length >= maxUsers && !listData.list_temp[actualPosIdx].includes(userToModifyName)) {
                    const occupants = [...listData.list_temp[actualPosIdx]];
                    let canProceed = true;
                    for (const occName of occupants) {
                        const occId = Object.keys(state.names).find(id => state.names[id] === occName);
                        if (occId && listData.user_positions[occId] === actualPos) {
                           if (!canManageUser(userId, occId)) {
                                await botInstance.sendMessage(msg.chat.id, `Нельзя заменить ${occName} на этой позиции: ${config.messages.cannotManageGirl}`);
                                canProceed = false;
                                break;
                           }
                        }
                    }
                    if (!canProceed) return;

                    for (const occName of occupants) {
                         const occId = Object.keys(state.names).find(id => state.names[id] === occName);
                         if (occId && listData.user_positions[occId] === actualPos) {
                            delete listData.user_positions[occId];
                         }
                    }
                    listData.list_temp[actualPosIdx] = [];
                    listData.list_temp[actualPosIdx] = listData.list_temp[actualPosIdx].filter(entry => !(typeof entry === 'string' && entry.startsWith("Тема:")));
                }


                if (listData.list_temp[actualPosIdx].length < maxUsers || listData.list_temp[actualPosIdx].includes(userToModifyName)) {
                    if (!listData.list_temp[actualPosIdx].includes(userToModifyName)) {
                        listData.list_temp[actualPosIdx].push(userToModifyName);
                    }
                    listData.user_positions[userToModifyId] = actualPos;
                } else {
                     await botInstance.sendMessage(msg.chat.id, `Позиция ${actualPos} уже занята.`);
                     return;
                }

            } else {
                if (listData.list_temp[posIdx].length < maxUsers || listData.list_temp[posIdx].includes(userToModifyName)) {
                    if (!listData.list_temp[posIdx].includes(userToModifyName)) {
                        listData.list_temp[posIdx].push(userToModifyName);
                    }
                    listData.user_positions[userToModifyId] = targetPosition;
                } else {
                    await botInstance.sendMessage(msg.chat.id, `На позиции ${targetPosition} в команде достигнут лимит участников.`);
                    return;
                }
            }
            await updateListText(listKey);
        }
    } else if (msg.text && (msg.text.toLowerCase().includes('кыздар') || msg.text.toLowerCase().includes('қыздар') || msg.text.toLowerCase().includes('девочки') || msg.text.toLowerCase().includes('мы') || msg.text.toLowerCase().includes('біз'))) {
        const numStrMatch = msg.text.match(/\d+/);
        if (numStrMatch && listData.type === 'team') {
            const teamPos = parseInt(numStrMatch[0], 10);
            if (teamPos >= 1 && teamPos <= config.MAX_LIST_POSITIONS) {
                const teamPosIdx = teamPos - 1;
                if (!listData.list_temp[teamPosIdx] || !Array.isArray(listData.list_temp[teamPosIdx])) {
                     listData.list_temp[teamPosIdx] = [];
                }

                config.girlsIds.forEach(girlId => {
                    const girlIdStr = String(girlId);
                    const girlName = state.names[girlIdStr];
                    if (girlName) {
                        if (listData.user_positions[girlIdStr]) {
                            const oldPosIdx = listData.user_positions[girlIdStr] - 1;
                            if (listData.list_temp[oldPosIdx] && Array.isArray(listData.list_temp[oldPosIdx])) {
                                listData.list_temp[oldPosIdx] = listData.list_temp[oldPosIdx].filter(name => name !== girlName);
                                listData.list_temp[oldPosIdx] = listData.list_temp[oldPosIdx].filter(entry => !(typeof entry === 'string' && entry.startsWith("Тема:")));
                            }
                        }
                        if (listData.list_temp[teamPosIdx].length < config.MAX_USERS_PER_POSITION_TEAM &&
                            !listData.list_temp[teamPosIdx].includes(girlName)) {
                            listData.list_temp[teamPosIdx].push(girlName);
                            listData.user_positions[girlIdStr] = teamPos;
                        }
                    }
                });
                await updateListText(listKey);
            }
        }
    }
}

async function handleMentionInput(msg, entities) {
    if (!msg.reply_to_message || !msg.text) return;

    const listKey = findActiveListKey(msg, state.lists);
    if (!listKey || !state.lists[listKey]) return;

    const listData = state.lists[listKey];
    const editorId = String(msg.from.id);

    if (!isAdmin(editorId)) {
        return;
    }

    const textParts = msg.text.trim().split(/\s+/);
    const positionInput = parseInt(textParts[0], 10);

    if (isNaN(positionInput) || positionInput < 0 || positionInput > config.MAX_LIST_POSITIONS) {
        return;
    }

    const mentionedUserIds = [];
    const unresolvedUsernames = [];
    let chatAdminsFetched = false;
    let chatAdminsList = [];

    for (const entity of entities) {
        if (entity.type === 'text_mention' && entity.user && entity.user.id) {
            mentionedUserIds.push(String(entity.user.id));
        } else if (entity.type === 'mention') {
            const username = msg.text.substring(entity.offset + 1, entity.offset + entity.length);
            let foundUserId = null;

            const foundEntryByName = Object.entries(state.names).find(([id, name]) =>
                name && typeof name === 'string' && name.toLowerCase() === username.toLowerCase()
            );
            if (foundEntryByName && foundEntryByName[0]) {
                foundUserId = foundEntryByName[0];
            } else {
                if (!chatAdminsFetched) {
                    try {
                        chatAdminsList = await botInstance.getChatAdministrators(msg.chat.id);
                        chatAdminsFetched = true;
                    } catch (e) {
                        console.warn(`Не удалось получить список администраторов чата ${msg.chat.id}:`, e.message);
                    }
                }
                const mentionedAdmin = chatAdminsList.find(member => member.user && member.user.username === username);
                if (mentionedAdmin && mentionedAdmin.user) {
                    foundUserId = String(mentionedAdmin.user.id);
                }
            }

            if (foundUserId) {
                mentionedUserIds.push(foundUserId);
            } else {
                console.warn(`Не удалось сопоставить @${username} с известным пользователем.`);
                unresolvedUsernames.push(`@${username}`);
            }
        }
    }

    let listWasModified = false;

    if (mentionedUserIds.length > 0) {
        for (const targetUserId of mentionedUserIds) {
            const targetUserName = state.names[targetUserId];
            if (!targetUserName) {
                await botInstance.sendMessage(msg.chat.id, `Пользователь с ID ${targetUserId} (упомянутый) должен сначала установить имя командой /name, чтобы его можно было добавить в список.`);
                continue;
            }
            if (!canManageUser(editorId, targetUserId)) {
                await botInstance.sendMessage(msg.chat.id, `Вы не можете управлять ${targetUserName}: ${config.messages.cannotManageGirl}`);
                continue;
            }

            if (positionInput === 0) {
                if (listData.user_positions[targetUserId]) {
                    const oldPosIdx = listData.user_positions[targetUserId] - 1;
                    if (listData.list_temp[oldPosIdx] && Array.isArray(listData.list_temp[oldPosIdx])) {
                        const initialLength = listData.list_temp[oldPosIdx].length;
                        listData.list_temp[oldPosIdx] = listData.list_temp[oldPosIdx].filter(nameInList => nameInList !== targetUserName);
                        listData.list_temp[oldPosIdx] = listData.list_temp[oldPosIdx].filter(entry => !(typeof entry === 'string' && entry.startsWith("Тема:")));
                        if (listData.list_temp[oldPosIdx].length < initialLength) listWasModified = true;
                    }
                    delete listData.user_positions[targetUserId];
                    listWasModified = true;
                }
            } else {
                const posIdx = positionInput - 1;
                if (listData.user_positions[targetUserId] && listData.user_positions[targetUserId] !== positionInput) {
                    const oldPosIdx = listData.user_positions[targetUserId] - 1;
                    if (listData.list_temp[oldPosIdx] && Array.isArray(listData.list_temp[oldPosIdx])) {
                         const initialLength = listData.list_temp[oldPosIdx].length;
                        listData.list_temp[oldPosIdx] = listData.list_temp[oldPosIdx].filter(nameInList => nameInList !== targetUserName);
                        listData.list_temp[oldPosIdx] = listData.list_temp[oldPosIdx].filter(entry => !(typeof entry === 'string' && entry.startsWith("Тема:")));
                        if (listData.list_temp[oldPosIdx].length < initialLength) listWasModified = true;
                    }
                }
                if (!listData.list_temp[posIdx] || !Array.isArray(listData.list_temp[posIdx])) {
                    listData.list_temp[posIdx] = [];
                }

                const maxUsers = listData.type === 'list' ? config.MAX_USERS_PER_POSITION_LIST : config.MAX_USERS_PER_POSITION_TEAM;

                if (listData.type === 'list') {
                    if (listData.list_temp[posIdx].length >= maxUsers && !listData.list_temp[posIdx].includes(targetUserName)) {
                        const occupants = [...listData.list_temp[posIdx]];
                        let canProceedMention = true;
                        for (const occName of occupants) {
                            const occId = Object.keys(state.names).find(id => state.names[id] === occName);
                            if (occId && listData.user_positions[occId] === positionInput) {
                                if (!canManageUser(editorId, occId)) {
                                    await botInstance.sendMessage(msg.chat.id, `Нельзя заменить ${occName} на этой позиции: ${config.messages.cannotManageGirl}`);
                                    canProceedMention = false;
                                    break;
                                }
                            }
                        }
                        if (!canProceedMention) continue;

                        for (const occName of occupants) {
                            const occId = Object.keys(state.names).find(id => state.names[id] === occName);
                            if (occId && listData.user_positions[occId] === positionInput) {
                                delete listData.user_positions[occId];
                            }
                        }
                        listData.list_temp[posIdx] = [];
                        listData.list_temp[posIdx] = listData.list_temp[posIdx].filter(entry => !(typeof entry === 'string' && entry.startsWith("Тема:")));
                        listWasModified = true;
                    }
                    if (listData.list_temp[posIdx].length < maxUsers || listData.list_temp[posIdx].includes(targetUserName)) {
                        if (!listData.list_temp[posIdx].includes(targetUserName)) {
                            listData.list_temp[posIdx].push(targetUserName);
                        }
                        listData.user_positions[targetUserId] = positionInput;
                        listWasModified = true;
                    }
                } else {
                    if (listData.list_temp[posIdx].length < maxUsers || listData.list_temp[posIdx].includes(targetUserName)) {
                        if (!listData.list_temp[posIdx].includes(targetUserName)) {
                            listData.list_temp[posIdx].push(targetUserName);
                        }
                        listData.user_positions[targetUserId] = positionInput;
                        listWasModified = true;
                    }
                }
            }
        }
    }

    if (unresolvedUsernames.length > 0) {
        await botInstance.sendMessage(msg.chat.id, `Не удалось распознать или найти ID для: ${unresolvedUsernames.join(', ')}. \nВозможные причины: \n1. Пользователь не является администратором этого чата (для поиска по @username). \n2. Бот не имеет прав администратора для получения списка участников. \n3. Отображаемое имя пользователя в /name не совпадает с его @username. \nРекомендуется использовать тег (синяя ссылка) или полное имя из /names.`);
    }

    if (listWasModified) {
        await updateListText(listKey);
    }
}


module.exports = {
    initListHandler,
    listCommand,
    teamCommand,
    handleNumericOrTextListInput,
    handleMentionInput
};
