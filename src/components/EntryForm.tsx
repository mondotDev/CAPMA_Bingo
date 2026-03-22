import { useState, type FormEvent } from "react";
import type { EventConfig } from "../features/event/event.types";
import type { EntryFormValues } from "../features/entry/entry.types";

type EntryFormProps = {
  disabled: boolean;
  event: EventConfig;
  onSubmit: (values: EntryFormValues) => Promise<void>;
  submitting: boolean;
};

export default function EntryForm({
  disabled,
  event,
  onSubmit,
  submitting,
}: EntryFormProps) {
  const [values, setValues] = useState<EntryFormValues>({
    name: "",
    company: "",
    email: "",
  });

  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  function updateValue(field: keyof EntryFormValues, value: string) {
    setValues((currentValues) => ({
      ...currentValues,
      [field]: value,
    }));
  }

  async function handleSubmit(eventObject: FormEvent<HTMLFormElement>) {
    eventObject.preventDefault();

    const trimmedValues = {
      name: values.name.trim(),
      company: values.company.trim(),
      email: values.email.trim(),
    };

    if (!trimmedValues.name || !trimmedValues.company || !trimmedValues.email) {
      setValidationMessage("Please complete all fields before continuing.");
      return;
    }

    setValidationMessage(null);
    await onSubmit(trimmedValues);
  }

  return (
    <form className="space-y-5" onSubmit={handleSubmit}>
      <div className="space-y-2 text-center">
        <h2 className="section-title">Enter This Event</h2>
        <p className="body-copy">
          One CAPMA Bingo entry per person for {event.name}.
        </p>
        {!event.submissionOpen ? (
          <p className="status-message">
            Bingo entry is not currently open for this event.
          </p>
        ) : null}
      </div>

      <div className="space-y-4">
        <label className="field-group">
          <span className="field-label">Name</span>
          <input
            autoComplete="name"
            className="field-input"
            disabled={disabled}
            onChange={(eventObject) => updateValue("name", eventObject.target.value)}
            type="text"
            value={values.name}
          />
        </label>

        <label className="field-group">
          <span className="field-label">Company</span>
          <input
            autoComplete="organization"
            className="field-input"
            disabled={disabled}
            onChange={(eventObject) => updateValue("company", eventObject.target.value)}
            type="text"
            value={values.company}
          />
        </label>

        <label className="field-group">
          <span className="field-label">Email</span>
          <input
            autoComplete="email"
            className="field-input"
            disabled={disabled}
            onChange={(eventObject) => updateValue("email", eventObject.target.value)}
            type="email"
            value={values.email}
          />
        </label>
      </div>

      {validationMessage ? (
        <p className="status-message">{validationMessage}</p>
      ) : null}

      <button className="button-primary" disabled={disabled} type="submit">
        {submitting ? "Loading Entry..." : "Continue"}
      </button>
    </form>
  );
}
