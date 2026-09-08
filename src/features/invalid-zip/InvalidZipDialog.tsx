import { useEffect, useRef, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ZipLayerStatus } from "../../domain/types";
import "./invalid-zip-dialog.css";

export type InvalidZipIssue = {
  fileName: string;
  layers: ZipLayerStatus[];
};

type InvalidZipDialogProps = {
  issue: InvalidZipIssue;
  onClose: () => void;
  onChooseAnother: () => void;
};

export default function InvalidZipDialog({
  issue,
  onClose,
  onChooseAnother,
}: InvalidZipDialogProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      className="react-invalid-zip-dialog"
      aria-labelledby="invalid-zip-dialog-title"
      aria-describedby="invalid-zip-dialog-description"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={handleBackdropMouseDown}
    >
      <div className="react-invalid-zip-dialog__shell">
        <div className="react-invalid-zip-dialog__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M12 8v5" />
            <path d="M12 17h.01" />
            <path d="M10.3 4.7 2.8 17.8A1.5 1.5 0 0 0 4.1 20h15.8a1.5 1.5 0 0 0 1.3-2.2L13.7 4.7a2 2 0 0 0-3.4 0Z" />
          </svg>
        </div>
        <header>
          <h2 id="invalid-zip-dialog-title">{t("invalidZip.title")}</h2>
          <p id="invalid-zip-dialog-description">
            {t("invalidZip.description", { fileName: issue.fileName })}
          </p>
        </header>

        <section className="react-invalid-zip-dialog__required">
          <strong>{t("invalidZip.requiredTitle")}</strong>
          <div aria-label={t("invalidZip.requiredTitle")}>
            <span>.shp</span>
            <span>.dbf</span>
            <span>.shx</span>
          </div>
          <p>{t("invalidZip.requiredDescription")}</p>
        </section>

        <section className="react-invalid-zip-dialog__details">
          <h3>{t("invalidZip.detectedTitle")}</h3>
          {issue.layers.length ? (
            <ul>
              {issue.layers.map((layer) => (
                <li key={layer.name}>
                  <span>{layer.name}</span>
                  <strong>
                    {t("invalidZip.layerMissing", {
                      files: layer.missingEssential.join(", "),
                    })}
                  </strong>
                </li>
              ))}
            </ul>
          ) : (
            <p>{t("invalidZip.noComponents")}</p>
          )}
        </section>

        <footer>
          <button type="button" onClick={onClose}>
            {t("invalidZip.close")}
          </button>
          <button type="button" className="is-primary" onClick={onChooseAnother}>
            {t("invalidZip.chooseAnother")}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
