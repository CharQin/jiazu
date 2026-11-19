import { generationName } from "./generations";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Cake,
  ChevronRight,
  Database,
  Heart,
  Home,
  Leaf,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
  X,
  UserRoundPlus,
} from "lucide-react";
import { Avatar } from "./Avatar";
import { Memorial } from "./Memorial";
import {
  ageLabel,
  branchInfo,
  familyName,
  personName,
  isFriend,
  relationshipPath,
  visibleFamilyMembers,
  maritalStatusInfo,
} from "./model";
import { deriveBranches } from "./kinship";
import { lunarBirthday } from "./birthday";
import type { FamilyData, Person } from "./model";

export function Brand({ large = false }: { large?: boolean }) {
  return (
    <div className={`brand ${large ? "brand-large" : ""}`}>
      <span className="brand-mark">
        <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
          <path
            d="M24 37V21M24 29L14 19M24 24L34 14"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <path d="M23 20C11 23 10 7 10 7S24 6 23 20Z" fill="currentColor" />
          <path d="M27 16C26 5 40 7 40 7S41 20 27 20" fill="#a9c394" />
          <path d="M16 27C8 29 6 20 6 20S16 18 18 26" fill="#a9c394" />
          <path d="M27 30C26 21 38 23 38 23S38 34 27 34" fill="currentColor" />
        </svg>
      </span>
      <span>
        <strong>
          家族<span className="brand-dot">.</span>
        </strong>
        <small>把家人，放在心上</small>
      </span>
    </div>
  );
}
export function Sheet({
  title,
  onClose,
  children,
  wide = false,
  dismissOnBackdrop = true,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  dismissOnBackdrop?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null),
    closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const sheet = ref.current!;
    const backdrop = sheet.parentElement!;
    const viewport = window.visualViewport;
    let frame = 0;
    function update() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const height = viewport?.height ?? window.innerHeight;
        const top = viewport?.offsetTop ?? 0;
        backdrop.style.setProperty("--sheet-viewport-height", `${height}px`);
        backdrop.style.setProperty("--sheet-viewport-top", `${top}px`);
        const active = document.activeElement;
        if (
          !(active instanceof HTMLElement) ||
          !sheet.contains(active) ||
          !active.matches("input:not([type=file]), textarea, select")
        )
          return;
        const bounds = sheet.getBoundingClientRect();
        const field = active.getBoundingClientRect();
        const header =
          sheet.querySelector(".sheet-header")?.getBoundingClientRect()
            .height ?? 0;
        const footer =
          sheet.querySelector(".sticky-actions")?.getBoundingClientRect()
            .height ?? 0;
        const visibleTop = Math.max(bounds.top, top) + header + 16;
        const visibleBottom =
          Math.min(bounds.bottom, top + height) - footer - 16;
        // Scroll this sheet alone; moving the page can put a fixed dialog under the IME.
        const delta =
          field.height > visibleBottom - visibleTop || field.top < visibleTop
            ? field.top - visibleTop
            : field.bottom > visibleBottom
              ? field.bottom - visibleBottom
              : 0;
        if (delta) sheet.scrollTop += delta;
      });
    }
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    sheet.addEventListener("focusin", update);
    return () => {
      cancelAnimationFrame(frame);
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      sheet.removeEventListener("focusin", update);
    };
  }, []);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null,
      el = ref.current!;
    el.focus({ preventScroll: true });
    const keydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const items = [
          ...el.querySelectorAll<HTMLElement>(
            'button, input, textarea, select, a[href], [tabindex="0"]',
          ),
        ].filter(
          (i) => !i.hasAttribute("disabled") && i.getClientRects().length,
        );
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === el)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    el.addEventListener("keydown", keydown);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      el.removeEventListener("keydown", keydown);
      document.body.style.overflow = old;
      previous?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <div
      className="sheet-backdrop"
      onClick={(e) => {
        if (dismissOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`sheet ${wide ? "sheet-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="sheet-handle" />
        <header className="sheet-header">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="关闭面板"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function Empty({
  icon,
  title,
  text,
  action,
  actionLabel,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  action: () => void;
  actionLabel: string;
}) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
      <button className="button soft" onClick={action}>
        <Plus size={16} />
        {actionLabel}
      </button>
    </div>
  );
}
export function Confirmation({
  text,
  label,
  danger,
  onCancel,
  onConfirm,
}: {
  text: string;
  label: string;
  danger: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="confirm-body">
      <span className={`confirm-icon ${danger ? "danger" : ""}`}>
        {danger ? <Trash2 size={26} /> : <Database size={26} />}
      </span>
      <p>{text}</p>
      <div className="form-actions">
        <button className="button secondary" onClick={onCancel}>
          取消
        </button>
        <button
          className={`button ${danger ? "danger-button" : "primary"}`}
          onClick={onConfirm}
        >
          {label}
        </button>
      </div>
    </div>
  );
}
export function Profile({
  person,
  data,
  onEdit,
  onMemory,
  onLocate,
  onSelect,
  onDelete,
  onFriend,
}: {
  person: Person;
  data: FamilyData;
  onEdit: () => void;
  onMemory: () => void;
  onLocate: () => void;
  onSelect: (p: Person) => void;
  onDelete?: () => void;
  onFriend: () => void;
}) {
  const family = data.families.find((f) => f.id === person.familyId)!,
    years = ageLabel(person),
    path =
      person.id === data.selfId || isFriend(person)
        ? []
        : relationshipPath(data, person.id),
    host = data.people.find((p) => p.id === person.friendOfId),
    birth = person.birthdayParts,
    birthdayLabel = person.birthday
      ? person.birthday.replaceAll("-", ".")
      : birth
        ? `${birth.year ? `${birth.year}年` : ""}${birth.month ? `${birth.month}月` : ""}${birth.day ? `${birth.day}日` : ""}`
        : "";
  const records = data.memories
    .filter((m) => m.personId === person.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const relatives = visibleFamilyMembers(data).filter(
    (p) => p.familyId === person.familyId && !isFriend(p),
  );
  return (
    <div className="profile-content">
      <div className="profile-cover">
        <span>FAMILY IS A FEELING</span>
        <button
          className="profile-edit"
          aria-label={`编辑${personName(person, data.selfId)}的资料`}
          onClick={onEdit}
        >
          <Pencil size={16} />
          编辑资料
        </button>
        <Leaf className="cover-leaf" size={94} strokeWidth={0.5} />
      </div>
      <div className="profile-identity">
        <Avatar person={person} size={78} />
        {person.id !== data.selfId && (person.relation || isFriend(person)) && (
          <span className="relation-badge">{person.relation || "朋友"}</span>
        )}
        <h2>
          {personName(person, data.selfId)}
          <span>
            {person.gender === "male"
              ? "♂"
              : person.gender === "female"
                ? "♀"
                : ""}
          </span>
        </h2>
        <p>
          {person.deceased ? <Memorial /> : years || "年龄待补充"}
          <i />
          {person.occupation ||
            (isFriend(person) ? "朋友" : generationName(person.generation))}
        </p>
        <div className="profile-tags">
          {person.tags.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
      <div className="profile-details">
        {person.maritalStatus && (
          <div>
            <Heart size={16} />
            <span>婚姻</span>
            <strong>{maritalStatusInfo[person.maritalStatus]}</strong>
          </div>
        )}
        {birthdayLabel && (
          <div>
            <Cake size={16} />
            <span>生日</span>
            <strong>
              {birthdayLabel}
              <small>
                {person.birthday
                  ? `农历 · ${lunarBirthday(person.birthday)}`
                  : "完整填写年月日后换算农历"}
              </small>
            </strong>
          </div>
        )}
        <div>
          <MapPin size={16} />
          <span>住址</span>
          <strong>{person.address || "还没有记录"}</strong>
        </div>
        <div>
          <Phone size={16} />
          <span>联系</span>
          {person.phone ? (
            <a href={`tel:${person.phone}`}>{person.phone}</a>
          ) : (
            <strong className="muted">还没有记录</strong>
          )}
        </div>
      </div>
      <div className="profile-section">
        <h3>
          <span>我们怎么相连</span>
          <button onClick={onLocate}>
            在图中查看 <ArrowRight size={12} />
          </button>
        </h3>
        {isFriend(person) ? (
          <p className="small-muted">
            {host ? `${personName(host, data.selfId)}的朋友` : "暂未关联家人"}
          </p>
        ) : person.id === data.selfId ? null : path.length ? (
          <div className="relation-path">
            {path.map((p, i) => (
              <div key={p.id}>
                {i > 0 && <ChevronRight size={12} />}
                <button onClick={() => onSelect(p)}>
                  <Avatar person={p} size={25} />
                  <span>{personName(p, data.selfId)}</span>
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="small-muted">可编辑父母或伴侣关系，补充亲属连线。</p>
        )}
        {!isFriend(person) && (
          <>
            <div className="profile-family">
              <span className="small-house">
                <Home size={16} />
              </span>
              <div>
                <strong>{familyName(family, data.people)}</strong>
                <small>
                  {[...(deriveBranches(data).get(person.id) ?? [])]
                    .map((b) => branchInfo[b].label)
                    .join(" / ")}{" "}
                  · {relatives.length} 位家人
                </small>
              </div>
              <div className="avatar-stack">
                {relatives
                  .filter((p) => p.id !== person.id)
                  .slice(0, 3)
                  .map((p) => (
                    <button
                      key={p.id}
                      onClick={() => onSelect(p)}
                      aria-label={`查看${personName(p, data.selfId)}`}
                    >
                      <Avatar person={p} size={27} />
                    </button>
                  ))}
              </div>
            </div>
            <button
              className="button soft full-width profile-add-friend"
              onClick={onFriend}
            >
              <UserRoundPlus size={15} />
              为这位家人添加朋友
            </button>
          </>
        )}
      </div>
      {person.note && (
        <div className="profile-section">
          <h3>
            <span>生活与近况</span>
            <Heart size={13} />
          </h3>
          <p className="profile-note">{person.note}</p>
        </div>
      )}
      <div className="profile-section">
        <h3>
          <span>最近的往来</span>
          <small>{records.length} 次记录</small>
        </h3>
        {records.length ? (
          <div className="mini-timeline">
            {records.slice(0, 2).map((m) => (
              <div key={m.id}>
                <i />
                <time>
                  {m.date ? m.date.slice(5).replace("-", ".") : "日期待补充"}
                  <span>{m.kind}</span>
                </time>
                <strong>{m.title || "未命名往来"}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="small-muted">还没有记录，记下下一次见面或问候吧。</p>
        )}
        <button className="button soft full-width" onClick={onMemory}>
          <Plus size={15} />
          记一笔往来
        </button>
      </div>
      <div className="profile-bottom">
        {onDelete && (
          <button className="delete-link" onClick={onDelete}>
            <Trash2 size={13} />
            删除{isFriend(person) ? "朋友" : "家人"}
          </button>
        )}
      </div>
    </div>
  );
}
