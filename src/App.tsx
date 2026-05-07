import { useEffect } from "react";
import { initPlanner } from "./planner";

export default function App() {
  useEffect(() => {
    initPlanner();
  }, []);

  return (
    <main className="app-shell">
      <section className="workspace" aria-label="План помещения">
        <div className="canvas-header">
          <div>
            <h1>Расчет плитки на пол</h1>
            <p>Кликайте точки помещения, вводите точную длину сегмента с клавиатуры и проверяйте раскладку.</p>
          </div>
          <div className="toolbar" aria-label="Инструменты">
            <div className="snap-menu">
              <button id="snapModeBtn" type="button" aria-haspopup="true" aria-expanded="false" title="Режим привязки">
                🧲 Сетка
              </button>
              <div id="snapModeMenu" className="snap-menu-list" hidden>
                <label>
                  <input type="checkbox" data-snap-option="guides" />
                  Гайдлайны
                </label>
                <label>
                  <input type="checkbox" data-snap-option="axes" />
                  Оси
                </label>
                <label>
                  <input type="checkbox" data-snap-option="grid" defaultChecked />
                  Сетка
                </label>
              </div>
            </div>
            <button id="closePolygonBtn" type="button">Замкнуть</button>
            <button id="removeLastPointBtn" type="button">Удалить последнюю</button>
            <button id="exportBtn" type="button">Экспорт</button>
            <button id="importBtn" type="button">Импорт</button>
            <input id="importFile" type="file" accept="application/json,.json" hidden />
            <button id="clearBtn" type="button">Очистить</button>
          </div>
        </div>
        <div className="canvas-wrap">
          <canvas id="planner" width="1120" height="760" tabIndex={0} aria-label="Редактор плана" />
        </div>
      </section>

      <aside className="panel" aria-label="Параметры расчета">
        <section>
          <h2>Помещение</h2>
          <label>
            Единицы чертежа
            <select id="drawUnit" defaultValue="cm">
              <option value="cm">Сантиметры</option>
              <option value="m">Метры</option>
              <option value="mm">Миллиметры</option>
            </select>
          </label>
          <label>
            Шаг сетки
            <input id="gridStep" type="number" min="0.01" defaultValue="10" step="1" />
          </label>
        </section>

        <section>
          <h2>Плитка</h2>
          <label>
            Ширина, мм
            <input id="tileWidth" type="number" min="1" defaultValue="600" />
          </label>
          <label>
            Длина, мм
            <input id="tileHeight" type="number" min="1" defaultValue="600" />
          </label>
          <label>
            Зазор, мм
            <input id="grout" type="number" min="0" defaultValue="2" />
          </label>
          <label>
            Запас, %
            <input id="waste" type="number" min="0" defaultValue="10" />
          </label>
        </section>

        <section>
          <h2>Раскладка</h2>
          <label>
            Тип
            <select id="layout" defaultValue="straight">
              <option value="straight">Прямая</option>
              <option value="brick">Со смещением 1/2</option>
              <option value="diagonal">Диагональная 45°</option>
              <option value="herringbone">Елочка</option>
            </select>
          </label>
          <label>
            Поворот, °
            <input id="rotation" type="number" defaultValue="0" step="5" />
          </label>
          <label>
            Смещение X, см
            <input id="layoutOffsetX" type="range" min="-200" max="200" defaultValue="0" step="1" />
          </label>
          <label>
            Смещение Y, см
            <input id="layoutOffsetY" type="range" min="-200" max="200" defaultValue="0" step="1" />
          </label>
          <label>
            Масштаб, x
            <input id="scale" type="number" min="0.25" max="4" defaultValue="1" step="0.05" />
          </label>
          <label className="check-row">
            <input id="showTileNumbers" type="checkbox" defaultChecked />
            Показывать номера плиток
          </label>
          <label className="check-row">
            <input id="highlightFullTiles" type="checkbox" defaultChecked />
            Подсвечивать целые плитки
          </label>
        </section>

        <section className="stats">
          <h2>Итог</h2>
          <dl>
            <div>
              <dt>Площадь</dt>
              <dd><span id="area">0</span> м²</dd>
            </div>
            <div>
              <dt>Плиток с учетом обрезков</dt>
              <dd><span id="tilesRaw">0</span> шт.</dd>
            </div>
            <div>
              <dt>С запасом</dt>
              <dd><span id="tilesWithWaste">0</span> шт.</dd>
            </div>
            <div>
              <dt>Обрезки</dt>
              <dd><span id="cutTiles">0</span> шт.</dd>
            </div>
          </dl>
        </section>
      </aside>
    </main>
  );
}
