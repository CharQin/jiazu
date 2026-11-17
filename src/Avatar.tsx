import type { Person } from "./model";
import { personName } from "./model";

export function Avatar({
  person,
  size = 44,
  shape = "circle",
}: {
  person: Person;
  size?: number;
  shape?: "circle" | "rounded";
}) {
  const seed = [...person.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const colors = [
    "#d9e8d5",
    "#f4dfd0",
    "#e4ddf4",
    "#d9e8ee",
    "#f1e7c8",
    "#f1dae1",
  ];
  const shirts = [
    "#6e8c74",
    "#cd927b",
    "#9391b9",
    "#7b9ca8",
    "#bba370",
    "#b98293",
  ];
  const female = person.gender === "female",
    senior = person.generation < 2;
  const hair = senior
    ? person.generation === 0
      ? "#b0ada5"
      : "#5d5953"
    : "#3f4140";
  if (person.avatar)
    return (
      <img
        className={`avatar${shape === "rounded" ? " avatar-rounded" : ""}`}
        src={person.avatar}
        alt={`${personName(person)}的头像`}
        style={{ width: size, height: size }}
      />
    );
  return (
    <svg
      className={`avatar${shape === "rounded" ? " avatar-rounded" : ""}`}
      width={size}
      height={size}
      viewBox="0 0 80 80"
      role="img"
      aria-label={`${personName(person)}的头像`}
    >
      <rect
        width="80"
        height="80"
        rx={shape === "rounded" ? 12 : 40}
        fill={colors[seed % colors.length]}
      />
      {female && <path d="M20 48V32C20 6 60 7 60 33V58H20Z" fill={hair} />}
      <path d="M10 80C10 51 70 51 70 80" fill={shirts[seed % shirts.length]} />
      <path d="M33 50V60Q40 66 47 60V50" fill="#e8bb9e" />
      <ellipse cx="40" cy="35" rx="17" ry="22" fill="#f1ceb1" />
      {female ? (
        <path
          d="M22 37C18 12 38 9 48 15Q63 18 58 40L53 29Q40 29 33 21Q28 31 22 37"
          fill={hair}
        />
      ) : (
        <path
          d="M23 35Q16 13 39 12Q62 10 57 36L52 24Q34 30 28 24Z"
          fill={hair}
        />
      )}
      <path
        d="M31 36H34M46 36H49"
        stroke="#54504a"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M36 46Q40 49 44 46"
        fill="none"
        stroke="#b07464"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {senior && (
        <g fill="none" stroke="#797970" strokeWidth="1.2">
          <rect x="27" y="31" width="12" height="10" rx="4" />
          <rect x="42" y="31" width="12" height="10" rx="4" />
          <path d="M39 35H42" />
        </g>
      )}
      {female && (
        <>
          <circle cx="23.5" cy="41" r="2" fill="#d2ae68" />
          <circle cx="56.5" cy="41" r="2" fill="#d2ae68" />
        </>
      )}
    </svg>
  );
}
