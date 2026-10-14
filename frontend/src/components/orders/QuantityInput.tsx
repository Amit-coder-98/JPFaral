import { useEffect, useState } from "react";
import {
  isValidQuantity,
  MAX_QUANTITY_KG,
  QUANTITY_MESSAGE,
} from "../../utils/pricing";
import {
  convertQuantityText,
  quantityKgFromInput,
  quantityText,
  type QuantityUnit,
} from "../../utils/quantity";

export function QuantityInput({
  quantity,
  index,
  error,
  onChange,
}: {
  quantity: number;
  index: number;
  error?: string;
  onChange: (quantityKg: number) => void;
}) {
  const [unit, setUnit] = useState<QuantityUnit>("kg");
  const [text, setText] = useState(() => quantityText(quantity, "kg"));
  useEffect(() => {
    if (!Object.is(quantity, quantityKgFromInput(text, unit)))
      setText(quantityText(quantity, unit));
  }, [quantity, text, unit]);
  const invalid = !!error || !isValidQuantity(quantity);
  const description = invalid ? `quantity-error-${index}` : undefined;
  return (
    <>
      <div className="quantity-input">
        <input
          aria-label={`Quantity for item ${index + 1}`}
          type="number"
          inputMode="decimal"
          step={unit === "kg" ? "0.25" : "250"}
          min={unit === "kg" ? "0.25" : "250"}
          max={quantityText(MAX_QUANTITY_KG, unit)}
          placeholder={
            unit === "kg" ? "उदा. 0.25, 0.5, 1, 10" : "उदा. 250, 500, 750"
          }
          value={text}
          aria-invalid={invalid}
          aria-describedby={description}
          onChange={(e) => {
            setText(e.target.value);
            onChange(quantityKgFromInput(e.target.value, unit));
          }}
        />
        <select
          aria-label={`Quantity unit for item ${index + 1}`}
          value={unit}
          onChange={(e) => {
            const next = e.target.value as QuantityUnit;
            const converted = convertQuantityText(text, unit, next);
            setUnit(next);
            setText(converted);
            onChange(quantityKgFromInput(converted, next));
          }}
        >
          <option value="kg">kg</option>
          <option value="g">gm</option>
        </select>
      </div>
      {invalid && (
        <span id={description} className="field-error" role="alert">
          {error || QUANTITY_MESSAGE}
        </span>
      )}
    </>
  );
}
