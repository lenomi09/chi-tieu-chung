'use strict';

// Bọc route async để lỗi tự rơi vào error handler thay vì làm crash tiến trình.
function asyncRoute(handler) {
  return (req, res, next) => handler(req, res, next).catch(next);
}

module.exports = asyncRoute;
