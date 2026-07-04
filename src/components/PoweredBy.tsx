declare const __DATA_PKG_VERSION__: string;

/** Required attribution for public deployments of 40kdc-data. */
export default function PoweredBy() {
  return (
    <p className="text-[11px] text-ink-faint">
      <a
        href="https://40kdc.alpacasoft.dev"
        target="_blank"
        rel="noreferrer"
        className="underline decoration-dotted"
      >
        Powered by 40kdc-data
      </a>
      {" · "}data v{__DATA_PKG_VERSION__}
    </p>
  );
}
