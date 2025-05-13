let admins = [];
let mainAdminId = null;
let girlsIds = [];

function initPermissions(loadedAdmins, loadedMainAdminId, loadedGirlsIds) {
    admins = loadedAdmins.map(String);
    mainAdminId = String(loadedMainAdminId);
    girlsIds = loadedGirlsIds.map(Number);
}

function isAdmin(userId) {
    return admins.includes(String(userId));
}

function isMainAdmin(userId) {
    return String(userId) === mainAdminId;
}

function isGirl(userId) {
    return girlsIds.includes(Number(userId));
}

function canManageUser(editorId, targetUserId) {
    if (isGirl(targetUserId)) {
        return isGirl(editorId) || isMainAdmin(editorId);
    }
    return true;
}


module.exports = {
    initPermissions,
    isAdmin,
    isMainAdmin,
    isGirl,
    canManageUser
};
