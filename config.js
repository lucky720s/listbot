require('dotenv').config();

module.exports = {
    token: process.env.TELEGRAM_BOT_TOKEN,
    mainAdminId: parseInt(process.env.MAIN_ADMIN_ID, 10),
    girlsIds: [1112854706, 1081111373, 934377290, 860881119],
    dataPaths: {
        names: 'data/names.json',
        lists: 'data/lists.json',
        admins: 'data/admins.json',
        listStatus: 'data/list_status.json',
        lastCallTimestamp: 'data/last_call_timestamp.json'
    },
    namePattern: /^[a-zA-Zа-яА-ЯәіңғүұқөһӘІҢҒҮҰҚӨҺ\s]*[.'\s]?[a-zA-Zа-яА-ЯәіңғүұқөһӘІҢҒҮҰҚӨҺ\s]*$/,
    MAX_LIST_POSITIONS: 22,
    MAX_USERS_PER_POSITION_LIST: 1,
    MAX_USERS_PER_POSITION_TEAM: 22,
    MENTION_CHUNK_SIZE: 5,
    MENTION_COOLDOWN: 30000,
    EMOJI_LIST: ['👩‍💻', '👩🏻‍💻', '👩🏽‍💻', '👩🏼‍💻', '👩🏾‍💻', '👩🏿‍💻', '👨‍💻', '👨🏻‍💻', '👨🏼‍💻', '👨🏽‍💻', '👨🏾‍💻', '👨🏿‍💻'],
    messages: {
        nameInvalid: "Имя должно содержать только буквы русского, английского или казахского языка и быть не длиннее 20 символов.",
        nameTaken: (name) => `Имя ${name} уже используется.`,
        listStatus: (status) => `Команда списка ${status === 'on' ? 'включена' : 'выключена'}`,
        listNow: (status) => `Команда списка теперь ${status === 'on' ? 'включена' : 'выключена'}.`,
        adminChangedListStatus: (adminName, status) => `${adminName} ${status === 'on' ? 'включил' : 'выключил'} список`,
        namesListEmpty: 'Список имен пуст.',
        adminAdded: (id) => `Пользователь с ID ${id} добавлен как администратор.`,
        adminExists: (id) => `Пользователь с ID ${id} уже является администратором.`,
        adminRemoved: (id) => `Пользователь с ID ${id} удален из списка администраторов.`,
        adminNotFound: (id) => `Пользователь с ID ${id} не найден в списке администраторов.`,
        adminsListTitle: 'Список администраторов:\n',
        noActiveLists: "Нет активных листов.",
        listDeleted: (listKey) => `Лист "${listKey}" был удален из активных листов.`,
        listOrTeamNotFound: "Активный лист или команда для ответа не найдены.",
        genericError: "Произошла ошибка. Пожалуйста, попробуйте позже.",
        topicTaken: "Эта тема уже занята.",
        cannotManageGirl: "У вас нет прав для управления этим пользователем из списка."
    }
};
