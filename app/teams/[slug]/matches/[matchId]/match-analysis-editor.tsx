"use client";

import {
  ArrowDown,
  ArrowUp,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";

import { validateMatchAnalysisPayload } from "../../../../../lib/matches/analysis-validation";
import type {
  MatchAnalysisCandidate,
  MatchEvent,
  MatchPlayerStat,
  MatchTeamMetrics,
} from "../../../../../lib/matches/model";
import { reloadAuthoritativeRoute } from "../authoritative-refresh";

type EditorProps = {
  slug: string;
  matchId: string;
  expectedUpdatedAt: string;
  events: readonly MatchEvent[];
  playerStats: readonly MatchPlayerStat[];
  teamMetrics: MatchTeamMetrics | null;
  candidates: readonly MatchAnalysisCandidate[];
};

type DraftEvent = {
  key: string;
  minute: string;
  eventType: MatchEvent["eventType"];
  teamSide: MatchEvent["teamSide"];
  playerUserId: string;
  secondaryUserId: string;
  note: string;
};
type DraftStat = {
  key: string;
  userId: string;
  minutesPlayed: string;
  goals: string;
  assists: string;
  rating: string;
  isMvp: boolean;
};
type MetricKey = "possession" | "shots" | "shotsOnTarget" | "corners";
type MetricDraft = Record<MetricKey, { team: string; opponent: string }>;
type EditorState = {
  events: DraftEvent[];
  stats: DraftStat[];
  metrics: MetricDraft;
};
type SaveState = {
  pending: boolean;
  message: string;
  success: boolean;
  fieldErrors: Readonly<Record<string, string>>;
};

const METRICS: readonly { key: MetricKey; label: string }[] = [
  { key: "possession", label: "Kiểm soát (%)" },
  { key: "shots", label: "Cú sút" },
  { key: "shotsOnTarget", label: "Trúng đích" },
  { key: "corners", label: "Phạt góc" },
];
const EVENT_LABELS: Readonly<Record<MatchEvent["eventType"], string>> = {
  goal: "Bàn thắng",
  yellow_card: "Thẻ vàng",
  red_card: "Thẻ đỏ",
  substitution: "Thay người",
  note: "Ghi chú",
};

function initialMetrics(metrics: MatchTeamMetrics | null): MetricDraft {
  return {
    possession: {
      team: metrics?.possession?.team.toString() ?? "",
      opponent: metrics?.possession?.opponent.toString() ?? "",
    },
    shots: {
      team: metrics?.shots?.team.toString() ?? "",
      opponent: metrics?.shots?.opponent.toString() ?? "",
    },
    shotsOnTarget: {
      team: metrics?.shotsOnTarget?.team.toString() ?? "",
      opponent: metrics?.shotsOnTarget?.opponent.toString() ?? "",
    },
    corners: {
      team: metrics?.corners?.team.toString() ?? "",
      opponent: metrics?.corners?.opponent.toString() ?? "",
    },
  };
}

function initialState(props: EditorProps): EditorState {
  return {
    events: props.events.map((event) => ({
      key: `stored-${event.id}`,
      minute: String(event.minute),
      eventType: event.eventType,
      teamSide: event.teamSide,
      playerUserId: event.playerUserId ?? "",
      secondaryUserId: event.secondaryUserId ?? "",
      note: event.note ?? "",
    })),
    stats: props.playerStats.map((stat) => ({
      key: `stored-${stat.userId}`,
      userId: stat.userId,
      minutesPlayed: String(stat.minutesPlayed),
      goals: String(stat.goals),
      assists: String(stat.assists),
      rating: stat.rating?.toString() ?? "",
      isMvp: stat.isMvp,
    })),
    metrics: initialMetrics(props.teamMetrics),
  };
}

function publicMessage(value: unknown, fallback: string): string {
  return typeof value === "object" &&
    value !== null &&
    "message" in value &&
    typeof value.message === "string"
    ? value.message
    : fallback;
}

function candidateLabel(candidate: MatchAnalysisCandidate): string {
  return candidate.displayName ?? `Cầu thủ ${candidate.userId.slice(0, 8)}`;
}

function numberFromInput(value: string): number {
  return value === "" ? Number.NaN : Number(value);
}

export function MatchAnalysisEditor(props: EditorProps) {
  const [baseline, setBaseline] = useState<EditorState>(() => initialState(props));
  const [draft, setDraft] = useState<EditorState>(() => initialState(props));
  const [token, setToken] = useState(props.expectedUpdatedAt);
  const [status, setStatus] = useState<SaveState>({
    pending: false,
    message: "",
    success: false,
    fieldErrors: {},
  });
  const nextKey = useRef(0);

  function reset() {
    setDraft(baseline);
    setStatus({
      pending: false,
      message: "Đã khôi phục dữ liệu đang lưu.",
      success: true,
      fieldErrors: {},
    });
  }

  function updateEvent(index: number, patch: Partial<DraftEvent>) {
    setDraft((current) => ({
      ...current,
      events: current.events.map((event, eventIndex) =>
        eventIndex === index ? { ...event, ...patch } : event,
      ),
    }));
  }

  function moveEvent(index: number, direction: -1 | 1) {
    setDraft((current) => {
      const destination = index + direction;
      if (destination < 0 || destination >= current.events.length)
        return current;
      const events = [...current.events];
      [events[index], events[destination]] = [
        events[destination]!,
        events[index]!,
      ];
      return { ...current, events };
    });
  }

  function addEvent() {
    nextKey.current += 1;
    setDraft((current) => ({
      ...current,
      events: [
        ...current.events,
        {
          key: `new-event-${nextKey.current}`,
          minute: "0",
          eventType: "note",
          teamSide: "team",
          playerUserId: "",
          secondaryUserId: "",
          note: "",
        },
      ],
    }));
  }

  function addStat() {
    const used = new Set(draft.stats.map((stat) => stat.userId));
    const candidate = props.candidates.find((item) => !used.has(item.userId));
    if (!candidate) return;
    nextKey.current += 1;
    setDraft((current) => ({
      ...current,
      stats: [
        ...current.stats,
        {
          key: `new-stat-${nextKey.current}`,
          userId: candidate.userId,
          minutesPlayed: "0",
          goals: "0",
          assists: "0",
          rating: "",
          isMvp: false,
        },
      ],
    }));
  }

  async function save() {
    const localErrors: Record<string, string> = {};
    const metrics: Record<string, { team: number; opponent: number }> = {};
    for (const { key } of METRICS) {
      const pair = draft.metrics[key];
      if (pair.team === "" && pair.opponent === "") continue;
      if (pair.team === "" || pair.opponent === "") {
        localErrors[
          `teamMetrics.${key}.${pair.team === "" ? "team" : "opponent"}`
        ] = "Nhập đủ cả hai chỉ số đội và đối thủ.";
        continue;
      }
      metrics[key] = {
        team: numberFromInput(pair.team),
        opponent: numberFromInput(pair.opponent),
      };
    }
    const occurrences = new Map<number, number>();
    const payload = {
      events: draft.events.map((event) => {
        const minute = numberFromInput(event.minute);
        const sequenceNo = (occurrences.get(minute) ?? 0) + 1;
        occurrences.set(minute, sequenceNo);
        return {
          minute,
          sequenceNo,
          eventType: event.eventType,
          teamSide: event.teamSide,
          playerUserId: event.playerUserId || null,
          secondaryUserId: event.secondaryUserId || null,
          note: event.note.trim().replace(/\s+/gu, " ") || null,
        };
      }),
      playerStats: draft.stats.map((stat) => ({
        userId: stat.userId,
        minutesPlayed: numberFromInput(stat.minutesPlayed),
        goals: numberFromInput(stat.goals),
        assists: numberFromInput(stat.assists),
        rating: stat.rating === "" ? null : numberFromInput(stat.rating),
        isMvp: stat.isMvp,
      })),
      teamMetrics: metrics,
      expectedUpdatedAt: token,
    };
    const parsed = validateMatchAnalysisPayload(payload);
    if (!parsed.ok || Object.keys(localErrors).length > 0) {
      const fieldErrors = {
        ...(parsed.ok || parsed.kind === "malformed" ? {} : parsed.fieldErrors),
        ...localErrors,
      };
      setStatus({
        pending: false,
        message:
          Object.values(fieldErrors)[0] ??
          "Vui lòng kiểm tra dữ liệu phân tích.",
        success: false,
        fieldErrors,
      });
      return;
    }
    setStatus({ pending: true, message: "", success: false, fieldErrors: {} });
    try {
      const response = await fetch(
        `/api/teams/${encodeURIComponent(props.slug)}/matches/${encodeURIComponent(props.matchId)}/analysis`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const fieldErrors =
          typeof body === "object" &&
          body !== null &&
          "fieldErrors" in body &&
          typeof body.fieldErrors === "object" &&
          body.fieldErrors !== null
            ? (body.fieldErrors as Readonly<Record<string, string>>)
            : {};
        setStatus({
          pending: false,
          message: publicMessage(body, "Không thể lưu phân tích trận đấu."),
          success: false,
          fieldErrors,
        });
        return;
      }
      if (
        typeof body !== "object" ||
        body === null ||
        !("updatedAt" in body) ||
        typeof body.updatedAt !== "string"
      ) {
        setStatus({
          pending: false,
          message: "Không thể xác nhận phiên bản dữ liệu mới.",
          success: false,
          fieldErrors: {},
        });
        return;
      }
      setToken(body.updatedAt);
      setBaseline(draft);
      setStatus({
        pending: false,
        message: "Đã lưu phân tích trận đấu.",
        success: true,
        fieldErrors: {},
      });
      reloadAuthoritativeRoute();
    } catch {
      setStatus({
        pending: false,
        message: "Không thể lưu phân tích trận đấu.",
        success: false,
        fieldErrors: {},
      });
    }
  }

  const fieldInvalid = (path: string) => path in status.fieldErrors;
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const hasMetricValues = METRICS.some(({ key }) =>
    draft.metrics[key].team !== "" || draft.metrics[key].opponent !== "",
  );
  const fieldA11y = (path: string) =>
    fieldInvalid(path)
      ? {
          "aria-invalid": true as const,
          "aria-describedby": "analysis-editor-message",
        }
      : {};
  return (
    <section
      className="card match-analysis-editor"
      aria-labelledby="match-analysis-editor-title"
      aria-busy={status.pending}
    >
      <div className="section-head analysis-editor-head">
        <div>
          <span>QUẢN TRỊ PHÂN TÍCH</span>
          <h2 id="match-analysis-editor-title">
            Ghi nhận diễn biến & thống kê
          </h2>
        </div>
        <div className="analysis-editor-actions">
          <button
            type="button"
            className="text-button"
            data-analysis-action="reset"
            disabled={status.pending || !dirty}
            onClick={reset}
          >
            <RotateCcw size={16} />
            Khôi phục
          </button>
          <button
            type="button"
            className="primary-button"
            data-analysis-action="save"
            disabled={status.pending || !dirty}
            onClick={() => void save()}
          >
            <Save size={16} />
            {status.pending ? "Đang lưu…" : "Lưu phân tích"}
          </button>
        </div>
      </div>
      <p className="match-muted analysis-editor-copy">
        Toàn bộ diễn biến, thống kê cầu thủ và chỉ số đội được lưu cùng lúc. Bản
        nháp cũ sẽ không ghi đè dữ liệu mới hơn.
      </p>
      {status.message && (
        <p
          id="analysis-editor-message"
          className={`match-message ${status.success ? "success" : "error"}`}
          role={status.success ? "status" : "alert"}
        >
          {status.message}
        </p>
      )}

      <div className="analysis-editor-grid">
        <div className="analysis-editor-panel">
          <div className="analysis-editor-panel-head">
            <div>
              <span>DIỄN BIẾN</span>
              <h3>Sự kiện trận đấu</h3>
            </div>
            <button
              type="button"
              className="text-button"
              data-analysis-action="add-event"
              disabled={status.pending || draft.events.length >= 200}
              onClick={addEvent}
            >
              <Plus size={16} />
              Thêm sự kiện
            </button>
          </div>
          {draft.events.length === 0 ? (
            <p className="match-muted">Chưa ghi nhận diễn biến.</p>
          ) : (
            <div className="analysis-event-list">
              {draft.events.map((event, index) => {
                const opponent = event.teamSide === "opponent";
                const secondaryAllowed =
                  !opponent &&
                  (event.eventType === "goal" ||
                    event.eventType === "substitution");
                return (
                  <fieldset
                    className="analysis-event-row"
                    data-analysis-event=""
                    key={event.key}
                  >
                    <legend>Sự kiện {index + 1}</legend>
                    <div className="analysis-event-fields">
                      <label>
                        Phút
                        <input
                          type="number"
                          min="0"
                          max="120"
                          disabled={status.pending}
                          value={event.minute}
                          {...fieldA11y(`events.${index}.minute`)}
                          onChange={(change) =>
                            updateEvent(index, { minute: change.target.value })
                          }
                        />
                      </label>
                      <label>
                        Loại
                        <select
                          value={event.eventType}
                          disabled={status.pending}
                          onChange={(change) => {
                            const eventType = change.target
                              .value as MatchEvent["eventType"];
                            updateEvent(index, {
                              eventType,
                              secondaryUserId:
                                eventType === "goal" ||
                                eventType === "substitution"
                                  ? event.secondaryUserId
                                  : "",
                            });
                          }}
                        >
                          {Object.entries(EVENT_LABELS).map(
                            ([value, label]) => (
                              <option value={value} key={value}>
                                {label}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                      <label>
                        Phía
                        <select
                          value={event.teamSide}
                          disabled={status.pending}
                          onChange={(change) => {
                            const teamSide = change.target
                              .value as MatchEvent["teamSide"];
                            updateEvent(index, {
                              teamSide,
                              ...(teamSide === "opponent"
                                ? { playerUserId: "", secondaryUserId: "" }
                                : {}),
                            });
                          }}
                        >
                          <option value="team">Đội nhà</option>
                          <option value="opponent">Đối thủ</option>
                        </select>
                      </label>
                      <label>
                        Cầu thủ
                        <select
                          value={event.playerUserId}
                          disabled={status.pending || opponent}
                          {...fieldA11y(`events.${index}.playerUserId`)}
                          onChange={(change) =>
                            updateEvent(index, {
                              playerUserId: change.target.value,
                            })
                          }
                        >
                          <option value="">Không chọn</option>
                          {props.candidates.map((candidate) => (
                            <option
                              value={candidate.userId}
                              key={candidate.userId}
                            >
                              {candidateLabel(candidate)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Liên quan
                        <select
                          value={event.secondaryUserId}
                          disabled={status.pending || !secondaryAllowed}
                          {...fieldA11y(`events.${index}.secondaryUserId`)}
                          onChange={(change) =>
                            updateEvent(index, {
                              secondaryUserId: change.target.value,
                            })
                          }
                        >
                          <option value="">Không chọn</option>
                          {props.candidates.map((candidate) => (
                            <option
                              value={candidate.userId}
                              key={candidate.userId}
                            >
                              {candidateLabel(candidate)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="analysis-note-field">
                        Ghi chú
                        <input
                          maxLength={500}
                          value={event.note}
                          disabled={status.pending}
                          {...fieldA11y(`events.${index}.note`)}
                          onChange={(change) =>
                            updateEvent(index, { note: change.target.value })
                          }
                        />
                      </label>
                    </div>
                    <div className="analysis-row-actions">
                      <button
                        type="button"
                        aria-label={`Đưa sự kiện ${index + 1} lên`}
                        disabled={index === 0 || status.pending}
                        onClick={() => moveEvent(index, -1)}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Đưa sự kiện ${index + 1} xuống`}
                        disabled={
                          index === draft.events.length - 1 || status.pending
                        }
                        onClick={() => moveEvent(index, 1)}
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Xóa sự kiện ${index + 1}`}
                        data-analysis-action="remove-event"
                        disabled={status.pending}
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            events: current.events.filter(
                              (_, eventIndex) => eventIndex !== index,
                            ),
                          }))
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </fieldset>
                );
              })}
            </div>
          )}
        </div>

        <div className="analysis-editor-panel">
          <div className="analysis-editor-panel-head">
            <div>
              <span>CẦU THỦ</span>
              <h3>Thống kê cá nhân</h3>
            </div>
            <button
              type="button"
              className="text-button"
              disabled={
                status.pending ||
                draft.stats.length >= props.candidates.length ||
                draft.stats.length >= 100
              }
              onClick={addStat}
            >
              <Plus size={16} />
              Thêm cầu thủ
            </button>
          </div>
          {draft.stats.length === 0 ? (
            <p className="match-muted">Chưa ghi nhận thống kê cầu thủ.</p>
          ) : (
            <div className="analysis-stat-list">
              {draft.stats.map((stat, index) => (
                <fieldset className="analysis-stat-row" key={stat.key}>
                  <legend>Cầu thủ {index + 1}</legend>
                  <label>
                    Cầu thủ
                    <select
                      value={stat.userId}
                      disabled={status.pending}
                      {...fieldA11y(`playerStats.${index}.userId`)}
                      onChange={(change) =>
                        setDraft((current) => ({
                          ...current,
                          stats: current.stats.map((item, statIndex) =>
                            statIndex === index
                              ? { ...item, userId: change.target.value }
                              : item,
                          ),
                        }))
                      }
                    >
                      {props.candidates.map((candidate) => (
                        <option value={candidate.userId} key={candidate.userId}>
                          {candidateLabel(candidate)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(["minutesPlayed", "goals", "assists"] as const).map(
                    (field) => (
                      <label key={field}>
                        {field === "minutesPlayed"
                          ? "Phút"
                          : field === "goals"
                            ? "Bàn"
                            : "Kiến tạo"}
                        <input
                          type="number"
                          min="0"
                          max={field === "minutesPlayed" ? 120 : 32767}
                          value={stat[field]}
                          disabled={status.pending}
                          {...fieldA11y(`playerStats.${index}.${field}`)}
                          onChange={(change) =>
                            setDraft((current) => ({
                              ...current,
                              stats: current.stats.map((item, statIndex) =>
                                statIndex === index
                                  ? { ...item, [field]: change.target.value }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </label>
                    ),
                  )}
                  <label>
                    Điểm
                    <input
                      type="number"
                      min="0"
                      max="10"
                      step="0.1"
                      value={stat.rating}
                      disabled={status.pending}
                      {...fieldA11y(`playerStats.${index}.rating`)}
                      onChange={(change) =>
                        setDraft((current) => ({
                          ...current,
                          stats: current.stats.map((item, statIndex) =>
                            statIndex === index
                              ? { ...item, rating: change.target.value }
                              : item,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className="analysis-mvp-field">
                    <input
                      type="checkbox"
                      name="analysis-mvp"
                      checked={stat.isMvp}
                      disabled={status.pending}
                      onChange={(change) =>
                        setDraft((current) => ({
                          ...current,
                          stats: current.stats.map((item, statIndex) => ({
                            ...item,
                            isMvp: change.target.checked && statIndex === index,
                          })),
                        }))
                      }
                    />
                    MVP
                  </label>
                  <button
                    type="button"
                    className="analysis-remove-stat"
                    aria-label={`Xóa thống kê cầu thủ ${index + 1}`}
                    disabled={status.pending}
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        stats: current.stats.filter(
                          (_, statIndex) => statIndex !== index,
                        ),
                      }))
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </fieldset>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="analysis-editor-panel analysis-metrics-panel">
        <div className="analysis-editor-panel-head">
          <div>
            <span>CHỈ SỐ ĐỘI</span>
            <h3>So sánh hai đội</h3>
          </div>
          <button
            type="button"
            className="text-button"
            data-analysis-action="clear-metrics"
            disabled={status.pending || !hasMetricValues}
            onClick={() =>
              setDraft((current) => ({
                ...current,
                metrics: initialMetrics(null),
              }))
            }
          >
            <Trash2 size={16} />
            Xóa chỉ số
          </button>
        </div>
        <div className="analysis-metric-grid">
          {METRICS.map(({ key, label }) => (
            <fieldset key={key}>
              <legend>{label}</legend>
              <label>
                PRO7
                <input
                  name={`${key}.team`}
                  type="number"
                  min="0"
                  max={key === "possession" ? 100 : 32767}
                  value={draft.metrics[key].team}
                  disabled={status.pending}
                  {...fieldA11y(`teamMetrics.${key}.team`)}
                  onChange={(change) =>
                    setDraft((current) => ({
                      ...current,
                      metrics: {
                        ...current.metrics,
                        [key]: {
                          ...current.metrics[key],
                          team: change.target.value,
                        },
                      },
                    }))
                  }
                />
              </label>
              <label>
                Đối thủ
                <input
                  name={`${key}.opponent`}
                  type="number"
                  min="0"
                  max={key === "possession" ? 100 : 32767}
                  value={draft.metrics[key].opponent}
                  disabled={status.pending}
                  {...fieldA11y(`teamMetrics.${key}.opponent`)}
                  onChange={(change) =>
                    setDraft((current) => ({
                      ...current,
                      metrics: {
                        ...current.metrics,
                        [key]: {
                          ...current.metrics[key],
                          opponent: change.target.value,
                        },
                      },
                    }))
                  }
                />
              </label>
            </fieldset>
          ))}
        </div>
      </div>
    </section>
  );
}
