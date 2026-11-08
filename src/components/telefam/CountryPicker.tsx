import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { getCountryList } from "@/lib/countries";

export function CountryPicker({ value, onChange }: { value: string; onChange: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const countries = useMemo(() => getCountryList(), []);
  const current = countries.find((c) => c.code === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Country code ${current?.name ?? ""}`}
          className="flex h-full shrink-0 items-center gap-1.5 border-r border-input px-3 text-sm text-foreground hover:bg-muted/60"
        >
          <span className="text-xl leading-none">{current?.flag}</span>
          <span className="tabular-nums text-muted-foreground">{current?.dial}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command
          filter={(itemValue, search) => (itemValue.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0)}
        >
          <CommandInput placeholder="Search country or code" />
          <CommandList className="max-h-72">
            <CommandEmpty>No country found.</CommandEmpty>
            {countries.map((c) => (
              <CommandItem
                key={c.code}
                value={`${c.name} ${c.dial} ${c.code}`}
                onSelect={() => {
                  onChange(c.code);
                  setOpen(false);
                }}
                className="gap-2"
              >
                <span className="text-lg leading-none">{c.flag}</span>
                <span className="flex-1 truncate">{c.name}</span>
                <span className="tabular-nums text-muted-foreground">{c.dial}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
