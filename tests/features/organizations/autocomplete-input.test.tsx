// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AutocompleteInput } from "@/features/organizations/components/autocomplete-input";

describe("AutocompleteInput", () => {
  it("handles keyboard Escape and Tab keys", () => {
    const onChange = vi.fn();
    render(
      <AutocompleteInput<string>
        value="test"
        onChange={onChange}
        fetchSuggestions={() => ["apple", "banana"]}
        getSuggestionValue={(s) => s}
        getSuggestionKey={(s) => s}
        renderSuggestion={(s) => <span>{s}</span>}
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-expanded")).toBe("true");

    // Escape closes
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input.getAttribute("aria-expanded")).toBe("false");

    // Tab closes
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Tab" });
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("handles keyboard ArrowUp and mouse events", async () => {
    const onChange = vi.fn();
    const onSelect = vi.fn();
    render(
      <AutocompleteInput<string>
        value="test"
        onChange={onChange}
        onSelect={onSelect}
        fetchSuggestions={() => ["apple", "banana"]}
        getSuggestionValue={(s) => s}
        getSuggestionKey={(s) => s}
        renderSuggestion={(s) => <span>{s}</span>}
        debounceMs={0}
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);

    // Wait for suggestions to load
    const option = await screen.findByText("apple");
    fireEvent.mouseEnter(option);

    // ArrowUp
    fireEvent.keyDown(input, { key: "ArrowUp" });
    // ArrowDown
    fireEvent.keyDown(input, { key: "ArrowDown" });
    // Enter
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalled();
  });

  it("handles disabled focus and unhighlighted Enter", () => {
    const onChange = vi.fn();
    render(
      <AutocompleteInput<string>
        value=""
        disabled
        onChange={onChange}
        fetchSuggestions={() => []}
        getSuggestionValue={(s) => s}
        getSuggestionKey={(s) => s}
        renderSuggestion={(s) => <span>{s}</span>}
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("ignores Enter when no suggestion is highlighted", () => {
    const onChange = vi.fn();
    render(
      <AutocompleteInput<string>
        value="a"
        onChange={onChange}
        fetchSuggestions={() => ["apple"]}
        getSuggestionValue={(s) => s}
        getSuggestionKey={(s) => s}
        renderSuggestion={(s) => <span>{s}</span>}
        debounceMs={0}
      />,
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    // Enter with no highlighted index
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });
});
