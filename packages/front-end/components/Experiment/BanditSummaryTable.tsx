import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CSSTransition } from "react-transition-group";
import { ExperimentInterfaceStringDates } from "back-end/types/experiment";
import { BanditEvent } from "back-end/src/validators/experiments";
import clsx from "clsx";
import { ExperimentMetricInterface } from "shared/experiments";
import { SnapshotMetric } from "back-end/types/experiment-snapshot";
import { getVariationColor } from "@/services/features";
import ResultsVariationsFilter from "@/components/Experiment/ResultsVariationsFilter";
import { useBanditSummaryTooltip } from "@/components/Experiment/BanditSummaryTableTooltip/useBanditSummaryTooltip";
import BanditSummaryTooltip from "@/components/Experiment/BanditSummaryTableTooltip/BanditSummaryTooltip";
import { TooltipHoverSettings } from "@/components/Experiment/ResultsTableTooltip/ResultsTableTooltip";
import AlignedGraph from "./AlignedGraph";

export const WIN_THRESHOLD_PROBABILITY = 0.95;
const ROW_HEIGHT = 56;
const ROW_HEIGHT_CONDENSED = 34;

export type BanditSummaryTableProps = {
  experiment: ExperimentInterfaceStringDates;
  metric: ExperimentMetricInterface | null;
  phase: number;
  isTabActive: boolean;
};

const intPercentFormatter = new Intl.NumberFormat(undefined, {
  style: "percent",
  maximumFractionDigits: 0,
});
const percentileFormatter = (v: number) => {
  if (v > 0.99) {
    return ">99%";
  }
  if (v < 0.01) {
    return "<1%";
  }
  return intPercentFormatter.format(v);
};

export default function BanditSummaryTable({
  experiment,
  metric,
  phase,
  isTabActive,
}: BanditSummaryTableProps) {
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [graphCellWidth, setGraphCellWidth] = useState(800);

  function onResize() {
    if (!tableContainerRef?.current?.clientWidth) return;
    const tableWidth = tableContainerRef.current?.clientWidth as number;
    const firstRowCells = tableContainerRef.current?.querySelectorAll(
      "#bandit-summary-results thead tr:first-child th:not(.graph-cell)"
    );
    let totalCellWidth = 0;
    for (let i = 0; i < firstRowCells.length; i++) {
      totalCellWidth += firstRowCells[i].clientWidth;
    }
    const graphWidth = tableWidth - totalCellWidth;
    setGraphCellWidth(Math.max(graphWidth, 200));
  }

  const phaseObj = experiment.phases[phase];

  const variations = experiment.variations.map((v, i) => {
    return {
      id: v.key || i + "",
      index: i,
      name: v.name,
    };
  });

  const [showVariations, setShowVariations] = useState<boolean[]>(
    variations.map(() => true)
  );
  const [variationsSort, setVariationsSort] = useState<"default" | "ranked">(
    "default"
  );
  const [showVariationsFilter, setShowVariationsFilter] = useState<boolean>(
    false
  );

  useEffect(() => {
    if (!isTabActive) {
      setShowVariationsFilter(false);
    }
  }, [isTabActive, setShowVariationsFilter]);

  const validEvents: BanditEvent[] =
    phaseObj?.banditEvents?.filter(
      (event) =>
        event.banditResult?.singleVariationResults && !event.banditResult?.error
    ) || [];
  const currentEvent = validEvents[validEvents.length - 1];
  const results = currentEvent?.banditResult?.singleVariationResults;

  const probabilities: number[] = useMemo(() => {
    let probs: number[] = [];
    let totalUsers = 0;
    for (let i = 0; i < variations.length; i++) {
      let prob =
        currentEvent?.banditResult?.bestArmProbabilities?.[i] ??
        1 / (variations.length || 2);
      if (!results?.[i]) {
        prob = NaN;
      } else {
        const users = results?.[i]?.users ?? 0;
        totalUsers += users;
        if (users < 100) {
          prob = NaN;
        }
      }
      probs.push(prob);
    }
    if (totalUsers < 100 * variations.length) {
      probs = probs.map(() => 1 / (variations.length || 2));
    }
    return probs;
  }, [variations, results, currentEvent]);

  function rankArray(values: (number | undefined)[]): number[] {
    const indices = values
      .map((value, index) => (value !== undefined ? index : -1))
      .filter((index) => index !== -1);
    indices.sort((a, b) => (values[b] as number) - (values[a] as number));
    const ranks = new Array(values.length).fill(0);
    indices.forEach((index, rank) => {
      ranks[index] = rank + 1;
    });
    return ranks;
  }

  const variationRanks = rankArray(probabilities);

  const sortedVariations =
    variationsSort === "default"
      ? variations
      : variations
          .slice()
          .sort((a, b) => variationRanks[a.index] - variationRanks[b.index]);

  const domain: [number, number] = useMemo(() => {
    if (!results) return [-0.1, 0.1];
    const cis = results.map((v) => v.ci).filter(Boolean) as [number, number][];
    let min = Math.min(
      ...cis.filter((_, i) => isFinite(probabilities?.[i])).map((ci) => ci[0])
    );
    let max = Math.max(
      ...cis.filter((_, i) => isFinite(probabilities?.[i])).map((ci) => ci[1])
    );
    if (!isFinite(min) || !isFinite(max)) {
      min = -0.1;
      max = 0.1;
    } else if (min === max) {
      if (min === 0) {
        min = -0.1;
        max = 0.1;
      } else {
        min *= 0.1;
        max *= 0.1;
      }
    }
    return [min, max];
  }, [results, probabilities]);

  const shrinkRows = variations.length > 8;
  const rowHeight = !shrinkRows ? ROW_HEIGHT : ROW_HEIGHT_CONDENSED;

  useEffect(() => {
    window.addEventListener("resize", onResize, false);
    return () => window.removeEventListener("resize", onResize, false);
  }, []);
  useLayoutEffect(onResize, []);
  useEffect(onResize, [isTabActive]);

  const {
    containerRef,
    tooltipOpen,
    tooltipData,
    hoveredX,
    hoveredY,
    hoverRow,
    leaveRow,
    closeTooltip,
    hoveredVariationRow,
    resetTimeout,
  } = useBanditSummaryTooltip({
    metric,
    variations,
    currentEvent,
    probabilities,
    regressionAdjustmentEnabled: experiment.regressionAdjustmentEnabled,
  });

  if (!results) {
    return null;
  }

  return (
    <div className="position-relative" ref={containerRef}>
      <CSSTransition
        key={hoveredVariationRow}
        in={
          tooltipOpen &&
          tooltipData &&
          hoveredX !== null &&
          hoveredY !== null &&
          hoveredVariationRow !== null
        }
        timeout={200}
        classNames="tooltip-animate"
        appear={true}
      >
        <BanditSummaryTooltip
          left={hoveredX ?? 0}
          top={hoveredY ?? 0}
          data={tooltipData}
          tooltipOpen={tooltipOpen}
          close={closeTooltip}
          onPointerMove={resetTimeout}
          onClick={resetTimeout}
          onPointerLeave={leaveRow}
        />
      </CSSTransition>

      <div ref={tableContainerRef} className="bandit-summary-results-wrapper">
        <div className="w-100" style={{ minWidth: 500 }}>
          <table
            id="bandit-summary-results"
            className="bandit-summary-results table-sm"
          >
            <thead>
              <tr className="results-top-row">
                <th className="axis-col header-label" style={{ width: 280 }}>
                  <div className="row px-0">
                    <ResultsVariationsFilter
                      variationNames={variations.map((v) => v.name)}
                      variationRanks={variationRanks}
                      showVariations={showVariations}
                      setShowVariations={setShowVariations}
                      variationsSort={variationsSort}
                      setVariationsSort={setVariationsSort}
                      showVariationsFilter={showVariationsFilter}
                      setShowVariationsFilter={setShowVariationsFilter}
                    />
                    <div className="col-auto">Variation</div>
                  </div>
                </th>
                <th
                  className="axis-col label text-right pr-3"
                  style={{ width: 120 }}
                >
                  <div
                    style={{
                      lineHeight: "15px",
                      marginBottom: 2,
                    }}
                  >
                    <span className="nowrap">Probability</span>{" "}
                    <span className="nowrap">of Winning</span>
                  </div>
                </th>
                <th
                  className="axis-col graph-cell"
                  style={{
                    width: window.innerWidth < 900 ? graphCellWidth : undefined,
                    minWidth:
                      window.innerWidth >= 900 ? graphCellWidth : undefined,
                  }}
                >
                  <div className="position-relative">
                    <AlignedGraph
                      id={`bandit-summery-table-axis`}
                      domain={domain}
                      significant={true}
                      showAxis={true}
                      axisOnly={true}
                      graphWidth={graphCellWidth}
                      percent={false}
                      height={45}
                      metricForFormatting={metric}
                    />
                  </div>
                </th>
              </tr>
            </thead>

            <tbody>
              {sortedVariations.map((v, j) => {
                if (!showVariations?.[v.index]) return null;
                const result = results?.[v.index];
                let stats: SnapshotMetric = {
                  value: NaN,
                  ci: [0, 0],
                  cr: NaN,
                  users: NaN,
                };
                if (result) {
                  stats = {
                    value: (result?.cr ?? 0) * (result?.users ?? 0),
                    ci: result?.ci ?? [0, 0],
                    cr: result?.cr ?? NaN,
                    users: result?.users ?? 0,
                  };
                }
                const probability =
                  probabilities?.[v.index] ?? 1 / (variations.length || 2);

                const isHovered = hoveredVariationRow === v.index;

                const onPointerMove = (e, settings?: TooltipHoverSettings) => {
                  // No hover tooltip if the screen is too narrow. Clicks still work.
                  if (e?.type === "mousemove" && window.innerWidth < 900) {
                    return;
                  }
                  hoverRow(v.index, e, settings);
                };
                const onPointerLeave = () => {
                  leaveRow();
                };

                return (
                  <tr
                    className="results-variation-row align-items-center"
                    style={
                      j === variations.length - 1
                        ? { boxShadow: "none" }
                        : undefined
                    }
                    key={j}
                  >
                    <td
                      className={`variation with-variation-label variation${v.index}`}
                      style={{ width: 280 }}
                    >
                      <div className="d-flex align-items-center">
                        <span
                          className="label ml-1"
                          style={{ width: 20, height: 20 }}
                        >
                          {v.index}
                        </span>
                        <span
                          className="d-inline-block text-ellipsis"
                          title={v.name}
                          style={{ width: 225 }}
                        >
                          {v.name}
                        </span>
                      </div>
                    </td>
                    <td
                      className={clsx("results-ctw chance text-right pr-3", {
                        won: (probability ?? 0) >= WIN_THRESHOLD_PROBABILITY,
                        hover: isHovered,
                      })}
                      onMouseMove={onPointerMove}
                      onMouseLeave={onPointerLeave}
                      onClick={onPointerMove}
                    >
                      {isFinite(probability) ? (
                        percentileFormatter(probability)
                      ) : (
                        <em className="text-muted">
                          <small>not enough data</small>
                        </em>
                      )}
                    </td>
                    <td className="graph-cell overflow-hidden">
                      <AlignedGraph
                        ci={stats.ci}
                        expected={isFinite(stats.cr) ? stats.cr : 0}
                        barType="violin"
                        barFillType="color"
                        barFillColor={getVariationColor(v.index, true)}
                        id={`bandit-summery-table_violin_${j}`}
                        domain={domain}
                        significant={true}
                        showAxis={false}
                        graphWidth={graphCellWidth}
                        percent={false}
                        height={rowHeight}
                        className={clsx({
                          hover: isHovered,
                        })}
                        isHovered={isHovered}
                        onMouseMove={(e) =>
                          onPointerMove(e, {
                            x: "element-center",
                            targetClassName: "hover-target",
                            offsetY: -8,
                          })
                        }
                        onMouseLeave={onPointerLeave}
                        onClick={(e) =>
                          onPointerMove(e, {
                            x: "element-center",
                            offsetY: -8,
                          })
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
