'use strict';

/**
 * Захищає роут простим статичним ключем у хедері `x-admin-key`.
 * - Якщо ADMIN_KEY не заданий в env  → 503 (сервіс не сконфігуровано)
 * - Якщо хедер відсутній/неправильний → 401
 */
function requireAdminKey(req, res, next) {
  const adminKey = process.env.ADMIN_KEY;

  if (!adminKey) {
    return res.status(503).json({
      success: false,
      message: 'Admin panel is not configured (ADMIN_KEY is missing)',
    });
  }

  const providedKey = req.get('x-admin-key');

  if (!providedKey || providedKey !== adminKey) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: invalid or missing x-admin-key header',
    });
  }

  next();
}

module.exports = { requireAdminKey };
