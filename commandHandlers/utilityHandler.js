const { mentionUsers, saveLastCallTimestamp } = require('../utils/messageUtils');
const { isAdmin, isMainAdmin } = require('../utils/permissions');

let botInstance;
let state;

function initUtilityHandler(bot, sharedState) {
    botInstance = bot;
    state = sharedState;
}

async function allCommand(msg) {
    saveLastCallTimestamp();
    await mentionUsers(botInstance, msg.chat.id);
}

async function helpCommand(msg) {
    const userId = msg.from.id;
    let helpText = "Общие команды:\n" +
                   "/list - Создать новый список очередности.\n" +
                   "/team - Создать новый список для команд/тем.\n" +
                   "/name <ваше_имя> - Установить или изменить ваше имя в боте.\n" +
                   "/names - Показать список всех зарегистрированных имен.\n" +
                   "Ответьте на сообщение списка числом (1-22), чтобы занять позицию.\n" +
                   "Ответьте 0, чтобы убрать себя из списка.\n" +
                   "Ответьте 't <текст темы>' или 't <номер темы по порядку>' (если вы в списке на этой позиции), чтобы добавить тему.\n" +
                   "Ответьте 't 0' (если вы в списке на этой позиции), чтобы удалить свою тему.\n";

    if (isAdmin(userId)) {
        helpText += "\nКоманды администратора:\n" +
                    "/status - Показать статус команд /list, /team (вкл/выкл).\n" +
                    "/liston - Включить команды /list, /team.\n" +
                    "/listoff - Выключить команды /list, /team.\n" +
                    "/admins - Показать список администраторов бота.\n" +
                    "/text <описание> - (ответом на список) Установить описание для списка.\n" +
                    "Администраторы могут добавлять/удалять пользователей из списка: <позиция> <ИмяПользователя> или <позиция> @упоминание.\n" +
                    "Пример: '1 Marat' или '0 @username'.\n";
    }

    if (isMainAdmin(userId)) {
        helpText += "\nКоманды главного администратора:\n" +
                    "/addadmin <ID_пользователя> - Добавить администратора.\n" +
                    "/remadmin <ID_пользователя> - Удалить администратора.\n" +
                    "/lists - Показать все активные списки (информация для отладки).\n" +
                    "/dellist <ID_сообщения_списка> - Удалить активный список.\n" +
                    "/name <ID_пользователя> <НовоеИмя> - Изменить имя любого пользователя.\n";
    }

    botInstance.sendMessage(msg.chat.id, helpText);
}


module.exports = {
    initUtilityHandler,
    allCommand,
    helpCommand
};
