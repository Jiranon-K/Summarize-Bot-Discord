//  ตรวจสอบสิทธิ์การใช้งาน Bot

async function checkPermission(member) {
  if (!process.env.ALLOWED_ROLES) {
    return true;
  }
  if (member.permissions.has("Administrator")) {
    return true;
  }
  const allowedRoles = process.env.ALLOWED_ROLES.split(",").map((id) =>
    id.trim()
  );
  const hasAllowedRole = member.roles.cache.some((role) =>
    allowedRoles.includes(role.id)
  );
  return hasAllowedRole;
}

function getAllowedRoles() {
  if (!process.env.ALLOWED_ROLES) return [];
  return process.env.ALLOWED_ROLES.split(",").map((id) => id.trim());
}

async function getAllowedRoleNames(guild) {
  const allowedRoleIds = getAllowedRoles();
  if (allowedRoleIds.length === 0) return ["ทุกคน"];
  const roleNames = [];
  for (const roleId of allowedRoleIds) {
    const role = guild.roles.cache.get(roleId);
    if (role) {
      roleNames.push(role.name);
    }
  }
  return roleNames.length > 0 ? roleNames : ["ไม่พบ Role"];
}

module.exports = {
  checkPermission,
  getAllowedRoles,
  getAllowedRoleNames,
};
