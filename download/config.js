/* config.js — единственный источник названия продукта (временное имя). Всё остальное берёт значения отсюда. */
(function (global) {
  "use strict";
  var AIWS = (global.AIWS = global.AIWS || {});
  AIWS.config = Object.freeze({
    APP_NAME: "AI Workspace",
    APP_TAGLINE: "Платформа ИИ-сотрудников для бизнеса",
    APP_TAGLINE_SHORT: "Платформа ИИ-сотрудников"   // для узких мест (подпись логотипа в сайдбаре)
  });
})(window);
