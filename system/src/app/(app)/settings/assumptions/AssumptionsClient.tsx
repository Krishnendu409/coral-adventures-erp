"use client";

import { useState } from "react";
import { updateBusinessParameter } from "@/server/domain/settings/actions";
import type { BusinessParameter } from "@/server/domain/settings/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Input, Button, Badge } from "@/components/ui";

interface Props {
  initialParameters: BusinessParameter[];
}

export function AssumptionsClient({ initialParameters }: Props) {
  const [parameters, setParameters] = useState<BusinessParameter[]>(initialParameters);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groupedParams = parameters.reduce((acc, param) => {
    const category = param.category || "Uncategorized";
    if (!acc[category]) acc[category] = [];
    acc[category].push(param);
    return acc;
  }, {} as Record<string, BusinessParameter[]>);

  const handleSave = async (param: BusinessParameter) => {
    setError(null);
    setLoading(true);
    
    const numValue = parseFloat(editValue);
    if (isNaN(numValue)) {
      setError("Please enter a valid number");
      setLoading(false);
      return;
    }

    const res = await updateBusinessParameter(param.param_id, numValue);
    if (res.success) {
      setParameters(params => params.map(p => p.param_id === param.param_id ? { ...p, value: numValue } : p));
      setEditingId(null);
    } else {
      setError(res.error || "Failed to save");
    }
    setLoading(false);
  };

  return (
    <div className="space-y-8">
      {/* Global error removed, using inline error instead */}

      {Object.entries(groupedParams).map(([category, params]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle>{category}</CardTitle>
            <CardDescription>Assumptions related to {category.toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-6">
              {params.map(param => (
                <div key={param.param_id} className="grid md:grid-cols-3 gap-4 items-center border-b border-border/50 pb-4 last:border-0 last:pb-0">
                  <div className="md:col-span-1">
                    <p className="font-medium text-foreground">{param.parameter}</p>
                    {param.notes && <p className="text-xs text-foreground-muted mt-1">{param.notes}</p>}
                    <div className="flex items-center gap-2 mt-2">
                      <Badge tone="neutral" className="text-[10px] uppercase tracking-wider font-semibold">
                        {param.category}
                      </Badge>
                    </div>
                  </div>
                  
                  <div className="md:col-span-2 flex items-center justify-between gap-4">
                    {editingId === param.param_id ? (
                      <div className="flex flex-col gap-1 w-full max-w-xs">
                        <div className="flex items-center gap-2">
                          <Input 
                            type="number" 
                            value={editValue} 
                            onChange={(e) => setEditValue(e.target.value)}
                            disabled={loading}
                          />
                          <span className="text-sm text-foreground-muted w-16">{param.unit}</span>
                        </div>
                        {error && <span className="text-xs text-danger font-medium mt-1">{error}</span>}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <p className="text-lg font-semibold tabular-nums">
                          {param.value !== null ? param.value.toLocaleString("en-US") : "—"}
                        </p>
                        <span className="text-sm text-foreground-muted">{param.unit}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 shrink-0">
                      {editingId === param.param_id ? (
                        <>
                          <Button 
                            variant="primary" 
                            size="sm" 
                            onClick={() => handleSave(param)}
                            disabled={loading}
                          >
                            Save
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setEditingId(null)}
                            disabled={loading}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button 
                          variant="secondary" 
                          size="sm" 
                          onClick={() => {
                            setEditingId(param.param_id);
                            setEditValue(param.value !== null ? String(param.value) : "");
                          }}
                        >
                          Edit
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
