import { useEffect, useState } from "react";
import {
  isValidQuantity,
  MAX_QUANTITY_KG,
  QUANTITY_MESSAGE,
} from "../../utils/pricing";
import {
  quantityKgFromInput,
  quantityText,
} from "../../utils/quantity";

export function QuantityInput({
  quantity,
  index,
  error,
  disabled = false,
  label,
  onChange,
}: {
  quantity: number;
  index: number;
  error?: string;
  disabled?: boolean;
  label?: string;
  onChange: (quantityKg: number) => void;
}) {
  const unit = "kg";
  const [text, setText] = useState(() => quantityText(quantity, "kg"));
  useEffect(() => {
    if (!Object.is(quantity, quantityKgFromInput(text, unit)))
      setText(quantityText(quantity, unit));
  }, [quantity, text, unit]);
  const invalid = !disabled && (!!error || !isValidQuantity(quantity));
  const description = invalid ? `quantity-error-${index}` : undefined;
  return (
    <>
      <div className="quantity-input">
        <input
          aria-label={label ?? `Quantity for item ${index + 1}`}
          type="number"
          inputMode="decimal"
          step="0.25"
          min="0.25"
          max={quantityText(MAX_QUANTITY_KG, unit)}
          placeholder="उदा. 0.25, 0.5, 1, 10"
          value={disabled ? "" : text}
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={description}
          onChange={(e) => {
            setText(e.target.value);
            onChange(quantityKgFromInput(e.target.value, unit));
          }}
        />
        <span className="quantity-unit" aria-hidden="true">kg</span>
      </div>
      {invalid && (
        <span id={description} className="field-error" role="alert">
          {error || QUANTITY_MESSAGE}
        </span>
      )}
    </>
  );
}
