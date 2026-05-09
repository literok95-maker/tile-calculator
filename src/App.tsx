import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { Download, Eraser, Hand, Magnet, Ruler, Upload, Waypoints, ZoomIn, ZoomOut } from "lucide-react";
import { type PlannerApi, initPlanner } from "./planner";
import {
  defaultPlannerSettings,
  type DrawUnit,
  type PlannerSettings,
  type PlannerStats,
  type SnapOption,
} from "./projectState";
import { readSnapOption, snapLabel } from "./snap";

const iconSize = 18;

const unitToCm: Record<DrawUnit, number> = {
  mm: 0.1,
  cm: 1,
  m: 100,
};

const defaultStats: PlannerStats = {
  area: "0",
  tilesRaw: "0",
  tilesWithWaste: "0",
  cutTiles: "0",
  reusedCutGroups: "0",
  reusableOffcuts: "0",
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const plannerRef = useRef<PlannerApi | null>(null);
  const [settings, setSettings] = useState<PlannerSettings>(() => defaultPlannerSettings());
  const settingsRef = useRef(settings);
  const initialSettingsRef = useRef(settings);
  const [stats, setStats] = useState<PlannerStats>(defaultStats);
  const [snapMenuOpen, setSnapMenuOpen] = useState(false);
  const [panToolActive, setPanToolActive] = useState(false);
  const [measureToolActive, setMeasureToolActive] = useState(false);

  useEffect(() => {
    settingsRef.current = settings;
    plannerRef.current?.setSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!canvasRef.current) return;

    plannerRef.current = initPlanner(canvasRef.current, {
      settings: initialSettingsRef.current,
      onSettingsChange: (nextSettings) => setSettings(nextSettings),
      onStatsChange: (nextStats) => setStats(nextStats),
      onPanToolChange: (active) => setPanToolActive(active),
      onMeasureToolChange: (active) => setMeasureToolActive(active),
    });

    return () => {
      plannerRef.current?.destroy();
      plannerRef.current = null;
    };
  }, []);

  function updateSettings(patch: Partial<PlannerSettings>) {
    setSettings((current) => ({
      ...current,
      ...patch,
      snapOptions: patch.snapOptions ? { ...patch.snapOptions } : current.snapOptions,
    }));
  }

  function updateTextSetting(key: keyof Pick<
    PlannerSettings,
    "gridStep" | "tileWidth" | "tileHeight" | "grout" | "waste" | "breakageWaste" | "minReusableCut" | "rotation" | "layoutOffsetX" | "layoutOffsetY" | "scale"
  >) {
    return (event: ChangeEvent<HTMLInputElement>) => updateSettings({ [key]: event.target.value });
  }

  function updateDrawUnit(event: ChangeEvent<HTMLSelectElement>) {
    const nextUnit = event.target.value as DrawUnit;
    const currentStepCm = Math.max(Number(settingsRef.current.gridStep) || 1, 0.01) * unitToCm[settingsRef.current.drawUnit];
    const convertedStep = currentStepCm / unitToCm[nextUnit];
    updateSettings({
      drawUnit: nextUnit,
      gridStep: String(Number(convertedStep.toFixed(3))),
    });
  }

  function updateSnapOption(option: SnapOption, checked: boolean) {
    updateSettings({
      snapOptions: {
        ...settingsRef.current.snapOptions,
        [option]: checked,
      },
    });
  }

  function exportProject() {
    const project = plannerRef.current?.exportProject();
    if (!project) return;
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.href = URL.createObjectURL(blob);
    link.download = `tile-plan-${date}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function importProject() {
    const file = importFileRef.current?.files?.[0];
    if (!file) return;

    try {
      const importedState = JSON.parse(await file.text());
      plannerRef.current?.importProject(importedState);
    } catch {
      alert("Не удалось импортировать чертеж. Проверьте, что выбран корректный JSON-файл.");
    } finally {
      if (importFileRef.current) {
        importFileRef.current.value = "";
      }
    }
  }

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
              <button
                className="icon-button"
                type="button"
                aria-haspopup="true"
                aria-expanded={snapMenuOpen}
                aria-label={snapLabel(settings.snapOptions)}
                title={snapLabel(settings.snapOptions)}
                onClick={() => setSnapMenuOpen((open) => !open)}
              >
                <Magnet size={iconSize} aria-hidden="true" />
              </button>
              <div className="snap-menu-list" hidden={!snapMenuOpen}>
                {(["guides", "axes", "grid"] as const).map((option) => (
                  <label key={option}>
                    <input
                      type="checkbox"
                      data-snap-option={option}
                      checked={settings.snapOptions[option]}
                      onChange={(event) => updateSnapOption(readSnapOption(option) ?? option, event.target.checked)}
                    />
                    {option === "guides" ? "Гайдлайны" : option === "axes" ? "Оси" : "Сетка"}
                  </label>
                ))}
              </div>
            </div>
            <button className="icon-button" type="button" title="Замкнуть контур" aria-label="Замкнуть контур" onClick={() => plannerRef.current?.closePolygon()}>
              <Waypoints size={iconSize} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" title="Экспортировать чертеж" aria-label="Экспортировать чертеж" onClick={exportProject}>
              <Download size={iconSize} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" title="Импортировать чертеж" aria-label="Импортировать чертеж" onClick={() => importFileRef.current?.click()}>
              <Upload size={iconSize} aria-hidden="true" />
            </button>
            <input ref={importFileRef} type="file" accept="application/json,.json" hidden onChange={importProject} />
            <button className="icon-button" type="button" title="Очистить чертеж" aria-label="Очистить чертеж" onClick={() => plannerRef.current?.clear()}>
              <Eraser size={iconSize} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className="canvas-wrap">
          <div className="canvas-controls" aria-label="Управление видом">
            <button className="icon-button" type="button" title="Увеличить масштаб" aria-label="Увеличить масштаб" onClick={() => plannerRef.current?.zoomIn()}>
              <ZoomIn size={iconSize} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" title="Уменьшить масштаб" aria-label="Уменьшить масштаб" onClick={() => plannerRef.current?.zoomOut()}>
              <ZoomOut size={iconSize} aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              type="button"
              title={panToolActive ? "Выключить руку" : "Рука для перетаскивания"}
              aria-label={panToolActive ? "Выключить руку" : "Рука для перетаскивания"}
              aria-pressed={panToolActive}
              onClick={() => plannerRef.current?.setPanToolEnabled(!panToolActive)}
            >
              <Hand size={iconSize} aria-hidden="true" />
            </button>
            <button
              className="icon-button"
              type="button"
              title={measureToolActive ? "Выключить рулетку" : "Рулетка"}
              aria-label={measureToolActive ? "Выключить рулетку" : "Рулетка"}
              aria-pressed={measureToolActive}
              onClick={() => plannerRef.current?.setMeasureToolEnabled(!measureToolActive)}
            >
              <Ruler size={iconSize} aria-hidden="true" />
            </button>
          </div>
          <canvas ref={canvasRef} width="1120" height="760" tabIndex={0} aria-label="Редактор плана" />
        </div>
      </section>

      <aside className="panel" aria-label="Параметры расчета">
        <section>
          <h2>Помещение</h2>
          <label>
            Единицы чертежа
            <select value={settings.drawUnit} onChange={updateDrawUnit}>
              <option value="cm">Сантиметры</option>
              <option value="m">Метры</option>
              <option value="mm">Миллиметры</option>
            </select>
          </label>
          <label>
            Шаг сетки
            <input type="number" min="0.01" value={settings.gridStep} step="1" onChange={updateTextSetting("gridStep")} />
          </label>
        </section>

        <section>
          <h2>Плитка</h2>
          <label>
            Ширина, мм
            <input type="number" min="1" value={settings.tileWidth} onChange={updateTextSetting("tileWidth")} />
          </label>
          <label>
            Длина, мм
            <input type="number" min="1" value={settings.tileHeight} onChange={updateTextSetting("tileHeight")} />
          </label>
          <label>
            Зазор, мм
            <input type="number" min="0" value={settings.grout} onChange={updateTextSetting("grout")} />
          </label>
          <label>
            Запас на подрезку, %
            <input type="number" min="0" value={settings.waste} onChange={updateTextSetting("waste")} />
          </label>
          <label>
            Запас на бой, %
            <input type="number" min="0" value={settings.breakageWaste} onChange={updateTextSetting("breakageWaste")} />
          </label>
          <label>
            Мин. полезный обрезок, мм
            <input type="number" min="0" value={settings.minReusableCut} onChange={updateTextSetting("minReusableCut")} />
          </label>
        </section>

        <section>
          <h2>Раскладка</h2>
          <label>
            Тип
            <select value={settings.layout} onChange={(event) => updateSettings({ layout: event.target.value as PlannerSettings["layout"] })}>
              <option value="straight">Прямая</option>
              <option value="brick">Со смещением 1/2</option>
              <option value="diagonal">Диагональная 45°</option>
              <option value="herringbone">Елочка</option>
            </select>
          </label>
          <label>
            Поворот, °
            <input type="number" value={settings.rotation} step="5" onChange={updateTextSetting("rotation")} />
          </label>
          <label>
            Смещение X, см
            <input type="range" min="-200" max="200" value={settings.layoutOffsetX} step="1" onChange={updateTextSetting("layoutOffsetX")} />
          </label>
          <label>
            Смещение Y, см
            <input type="range" min="-200" max="200" value={settings.layoutOffsetY} step="1" onChange={updateTextSetting("layoutOffsetY")} />
          </label>
          <label>
            Масштаб, x
            <input type="number" min="0.25" max="4" value={settings.scale} step="0.05" onChange={updateTextSetting("scale")} />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.showTileNumbers}
              onChange={(event) => updateSettings({ showTileNumbers: event.target.checked })}
            />
            Показывать номера плиток
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={settings.highlightFullTiles}
              onChange={(event) => updateSettings({ highlightFullTiles: event.target.checked })}
            />
            Подсвечивать целые плитки
          </label>
        </section>

        <section className="stats">
          <h2>Итог</h2>
          <dl>
            <div>
              <dt>Площадь</dt>
              <dd><span>{stats.area}</span> м²</dd>
            </div>
            <div>
              <dt>Плиток с учетом обрезков</dt>
              <dd><span>{stats.tilesRaw}</span> шт.</dd>
            </div>
            <div>
              <dt>С запасом</dt>
              <dd><span>{stats.tilesWithWaste}</span> шт.</dd>
            </div>
            <div>
              <dt>Обрезки</dt>
              <dd><span>{stats.cutTiles}</span> шт.</dd>
            </div>
            <div>
              <dt>Повторно сгруппировано</dt>
              <dd><span>{stats.reusedCutGroups}</span> групп</dd>
            </div>
            <div>
              <dt>Полезные остатки</dt>
              <dd><span>{stats.reusableOffcuts}</span> шт.</dd>
            </div>
          </dl>
        </section>
      </aside>
    </main>
  );
}
