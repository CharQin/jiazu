export function Memorial() {
  return (
    <span className="memorial-status">
      <svg
        width="11"
        height="13"
        viewBox="0 0 16 20"
        fill="none"
        aria-hidden="true"
      >
        <path d="M8 1C5 4 5 7 8 7C11 7 11 4 8 1Z" fill="#bc9b61" />
        <path
          d="M8 7V10M3 18H13M5 10H11V18H5Z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      已离世
    </span>
  );
}
