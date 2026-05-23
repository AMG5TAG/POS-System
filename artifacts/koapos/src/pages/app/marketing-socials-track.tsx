import { useState } from "react";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Facebook, Instagram, Twitter,
  Trophy, Users, Shuffle, RotateCcw, Plus, Trash2,
  Heart, MessageCircle, Repeat2, Share2, Info,
  CheckCircle2, Star,
} from "lucide-react";

interface Participant {
  id: string;
  name: string;
  handle?: string;
  engagementType: string;
  platform: string;
}

interface PlatformMeta {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
  engagements: { id: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
}

const PLATFORMS: PlatformMeta[] = [
  {
    id: "facebook",
    name: "Facebook",
    icon: Facebook,
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    border: "border-blue-200 dark:border-blue-800",
    engagements: [
      { id: "comments", label: "Comments", icon: MessageCircle },
      { id: "likes",    label: "Likes",    icon: Heart          },
      { id: "shares",   label: "Shares",   icon: Share2         },
    ],
  },
  {
    id: "instagram",
    name: "Instagram",
    icon: Instagram,
    color: "text-pink-600",
    bg: "bg-pink-50 dark:bg-pink-950/30",
    border: "border-pink-200 dark:border-pink-800",
    engagements: [
      { id: "comments", label: "Comments", icon: MessageCircle },
      { id: "likes",    label: "Likes",    icon: Heart          },
    ],
  },
  {
    id: "twitter",
    name: "X / Twitter",
    icon: Twitter,
    color: "text-sky-500",
    bg: "bg-sky-50 dark:bg-sky-950/30",
    border: "border-sky-200 dark:border-sky-800",
    engagements: [
      { id: "likes",     label: "Likes",     icon: Heart   },
      { id: "retweets",  label: "Retweets",  icon: Repeat2 },
    ],
  },
];

function randomWinner(participants: Participant[]): Participant | null {
  if (!participants.length) return null;
  return participants[Math.floor(Math.random() * participants.length)];
}

const DEMO_NAMES = [
  "Emma Williams","Liam Johnson","Olivia Brown","Noah Davis","Ava Miller",
  "Elijah Wilson","Sophia Moore","James Taylor","Isabella Anderson","William Thomas",
  "Mia Jackson","Oliver White","Charlotte Harris","Benjamin Martin","Amelia Thompson",
  "Lucas Garcia","Harper Martinez","Mason Robinson","Evelyn Clark","Ethan Rodriguez",
];

function generateDemoParticipants(platform: string, engagements: string[], count: number): Participant[] {
  return Array.from({ length: count }, (_, i) => {
    const name    = DEMO_NAMES[i % DEMO_NAMES.length] + (i >= DEMO_NAMES.length ? ` ${Math.floor(i / DEMO_NAMES.length) + 1}` : "");
    const handle  = "@" + name.toLowerCase().replace(/\s+/g, "_");
    const eng     = engagements[i % engagements.length];
    return {
      id:             Math.random().toString(36).slice(2, 10),
      name,
      handle,
      engagementType: eng,
      platform,
    };
  });
}

export default function MarketingSocialsTrackPage() {
  const [selectedPlatform, setSelectedPlatform] = useState("facebook");
  const [postUrl, setPostUrl] = useState("");
  const [selectedEngagements, setSelectedEngagements] = useState<string[]>(["comments"]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [winner, setWinner] = useState<Participant | null>(null);
  const [picking, setPicking] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualHandle, setManualHandle] = useState("");
  const [manualEngagement, setManualEngagement] = useState("comments");
  const [bulkText, setBulkText] = useState("");
  const [pastWinners, setPastWinners] = useState<Participant[]>([]);
  const [excludePastWinners, setExcludePastWinners] = useState(true);
  const [allowDuplicates, setAllowDuplicates] = useState(false);

  const platform = PLATFORMS.find((p) => p.id === selectedPlatform)!;
  const PlatformIcon = platform.icon;

  const toggleEngagement = (id: string) =>
    setSelectedEngagements((prev) =>
      prev.includes(id) ? prev.filter((e) => e !== id) : [...prev, id]
    );

  const handleLoadDemo = () => {
    if (!selectedEngagements.length) { toast.error("Select at least one engagement type"); return; }
    const count = Math.floor(Math.random() * 30) + 20;
    const demo  = generateDemoParticipants(selectedPlatform, selectedEngagements, count);
    setParticipants(demo);
    setWinner(null);
    toast.success(`Loaded ${count} demo participants — connect API credentials for live data`);
  };

  const handleLoadFromUrl = () => {
    if (!postUrl.trim()) { toast.error("Enter a post URL"); return; }
    if (!selectedEngagements.length) { toast.error("Select at least one engagement type"); return; }
    handleLoadDemo();
    toast.info("Live post loading requires API credentials configured in Management > Marketing");
  };

  const handleAddManual = () => {
    if (!manualName.trim()) { toast.error("Enter a participant name"); return; }
    const eng = platform.engagements.find((e) => e.id === manualEngagement) ?? platform.engagements[0];
    setParticipants((prev) => [...prev, {
      id:             Math.random().toString(36).slice(2, 10),
      name:           manualName.trim(),
      handle:         manualHandle.trim() || undefined,
      engagementType: eng.id,
      platform:       selectedPlatform,
    }]);
    setManualName("");
    setManualHandle("");
    toast.success("Participant added");
  };

  const handleBulkImport = () => {
    const lines = bulkText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) { toast.error("Enter at least one name per line"); return; }
    const eng = selectedEngagements[0] ?? platform.engagements[0].id;
    const newParticipants: Participant[] = lines.map((line) => ({
      id:             Math.random().toString(36).slice(2, 10),
      name:           line,
      engagementType: eng,
      platform:       selectedPlatform,
    }));
    setParticipants((prev) => [...prev, ...newParticipants]);
    setBulkText("");
    toast.success(`Added ${lines.length} participants`);
  };

  const handlePickWinner = () => {
    let pool = participants;
    if (excludePastWinners && pastWinners.length) {
      const pastIds = new Set(pastWinners.map((w) => w.id));
      pool = pool.filter((p) => !pastIds.has(p.id));
    }
    if (!allowDuplicates) {
      const seen = new Set<string>();
      pool = pool.filter((p) => {
        const key = `${p.name.toLowerCase()}-${p.handle ?? ""}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    if (!pool.length) { toast.error(excludePastWinners ? "No eligible participants (all are past winners)" : "No participants to pick from"); return; }

    setWinner(null);
    setPicking(true);

    let flashes = 0;
    const interval = setInterval(() => {
      setWinner(randomWinner(pool));
      flashes++;
      if (flashes >= 12) {
        clearInterval(interval);
        const finalWinner = randomWinner(pool)!;
        setWinner(finalWinner);
        setPastWinners((prev) => [...prev, finalWinner]);
        setPicking(false);
        toast.success(`🎉 Winner selected: ${finalWinner.name}`);
      }
    }, 120);
  };

  const filtered = allowDuplicates
    ? participants
    : [...new Map(participants.map((p) => [`${p.name.toLowerCase()}-${p.handle ?? ""}`, p])).values()];

  const eligibleCount = excludePastWinners
    ? filtered.filter((p) => !pastWinners.some((w) => w.id === p.id)).length
    : filtered.length;

  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Giveaway Tracker</h1>
            <p className="text-muted-foreground mt-1">Collect engagements from a social post and randomly pick a winner.</p>
          </div>
          {participants.length > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="gap-1"><Users className="w-3 h-3" /> {eligibleCount} eligible</Badge>
              <Button
                onClick={handlePickWinner}
                disabled={picking || eligibleCount === 0}
                className="gap-2"
              >
                <Shuffle className="w-4 h-4" />
                {picking ? "Picking…" : "Pick Winner"}
              </Button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* Setup panel */}
          <div className="space-y-4">
            {/* Platform selector */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Platform & Engagement</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Platform</Label>
                  <div className="flex gap-2 flex-wrap">
                    {PLATFORMS.map((p) => {
                      const Icon = p.icon;
                      const active = selectedPlatform === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            setSelectedPlatform(p.id);
                            setSelectedEngagements([p.engagements[0].id]);
                          }}
                          className={cn(
                            "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all",
                            active ? cn("border-2", p.border, p.bg) : "border-border bg-background hover:bg-muted"
                          )}
                        >
                          <Icon className={cn("w-3.5 h-3.5", active ? p.color : "text-muted-foreground")} />
                          {p.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Engagement Types</Label>
                  <div className="flex gap-3 flex-wrap">
                    {platform.engagements.map(({ id, label, icon: Icon }) => (
                      <label key={id} className="flex items-center gap-2 cursor-pointer text-sm">
                        <Checkbox
                          checked={selectedEngagements.includes(id)}
                          onCheckedChange={() => toggleEngagement(id)}
                        />
                        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Post URL</Label>
                  <div className="flex gap-2">
                    <Input
                      value={postUrl}
                      onChange={(e) => setPostUrl(e.target.value)}
                      placeholder={`https://${selectedPlatform === "twitter" ? "x.com" : selectedPlatform}.com/…`}
                    />
                    <Button variant="outline" onClick={handleLoadFromUrl} className="shrink-0">Load</Button>
                  </div>
                </div>

                <div className="rounded-lg bg-muted/50 p-3 flex gap-2 text-xs text-muted-foreground">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Live post loading requires API credentials. Go to Management &rsaquo; Marketing to connect accounts, or add participants manually below.
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 gap-1.5 text-sm" onClick={handleLoadDemo}>
                    <Users className="w-3.5 h-3.5" /> Load Demo Data
                  </Button>
                  {participants.length > 0 && (
                    <Button variant="ghost" size="icon" className="text-muted-foreground" title="Clear all" onClick={() => { setParticipants([]); setWinner(null); }}>
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Manual add */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Add Participants</CardTitle>
                <CardDescription>Add entries manually or paste a list.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Name</Label>
                    <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Jane Smith" onKeyDown={(e) => { if (e.key === "Enter") handleAddManual(); }} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Handle (optional)</Label>
                    <Input value={manualHandle} onChange={(e) => setManualHandle(e.target.value)} placeholder="@username" onKeyDown={(e) => { if (e.key === "Enter") handleAddManual(); }} />
                  </div>
                </div>
                <Button variant="outline" className="w-full gap-1.5" onClick={handleAddManual}>
                  <Plus className="w-3.5 h-3.5" /> Add Participant
                </Button>

                <Separator />

                <div className="space-y-1.5">
                  <Label className="text-xs">Bulk Import (one name per line)</Label>
                  <Textarea
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder={"Jane Smith\nJohn Doe\n@alex_99"}
                    className="min-h-20 text-sm resize-none"
                  />
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={handleBulkImport}>
                    <Plus className="w-3.5 h-3.5" /> Import List
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Options */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Options</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm">Exclude past winners</span>
                  <Checkbox checked={excludePastWinners} onCheckedChange={(c) => setExcludePastWinners(!!c)} />
                </label>
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-sm">Allow duplicate entries (same user, multiple engagements)</span>
                  <Checkbox checked={allowDuplicates} onCheckedChange={(c) => setAllowDuplicates(!!c)} />
                </label>
                {pastWinners.length > 0 && (
                  <>
                    <Separator />
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-medium text-muted-foreground">Past Winners ({pastWinners.length})</p>
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setPastWinners([])}>Clear</Button>
                      </div>
                      {pastWinners.map((w) => (
                        <div key={w.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Star className="w-3 h-3 text-yellow-500" /> {w.name}{w.handle ? ` (${w.handle})` : ""}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Results panel */}
          <div className="space-y-4">
            {/* Winner display */}
            <Card className={cn(
              "border-2 transition-all",
              winner
                ? "border-yellow-300 dark:border-yellow-700 bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-950/20 dark:to-amber-950/20"
                : "border-border"
            )}>
              <CardContent className="pt-6 pb-6 text-center space-y-3 min-h-48 flex flex-col items-center justify-center">
                {picking || winner ? (
                  <>
                    <div className={cn("rounded-full p-4", winner ? "bg-yellow-100 dark:bg-yellow-900/30" : "bg-muted")}>
                      <Trophy className={cn("w-10 h-10", winner ? "text-yellow-500" : "text-muted-foreground")} />
                    </div>
                    {winner ? (
                      <>
                        <div>
                          <p className="text-xs font-medium text-yellow-600 dark:text-yellow-400 uppercase tracking-wider mb-1">🎉 Winner</p>
                          <p className="text-2xl font-bold">{winner.name}</p>
                          {winner.handle && <p className="text-muted-foreground text-sm">{winner.handle}</p>}
                        </div>
                        <div className="flex gap-2 justify-center flex-wrap">
                          <Badge variant="secondary" className="gap-1">
                            <PlatformIcon className={cn("w-3 h-3", platform.color)} />
                            {platform.name}
                          </Badge>
                          <Badge variant="secondary" className="capitalize">{winner.engagementType}</Badge>
                        </div>
                        <Button variant="outline" size="sm" className="gap-1.5 mt-2" onClick={handlePickWinner} disabled={picking}>
                          <Shuffle className="w-3.5 h-3.5" /> Pick Again
                        </Button>
                      </>
                    ) : (
                      <p className="text-xl font-bold text-muted-foreground animate-pulse">Drawing…</p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="rounded-full bg-muted p-4">
                      <Trophy className="w-10 h-10 text-muted-foreground/30" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {participants.length === 0
                        ? "Load participants or add them manually, then pick a winner."
                        : `${eligibleCount} eligible participant${eligibleCount !== 1 ? "s" : ""} ready. Click Pick Winner.`}
                    </p>
                    {participants.length > 0 && (
                      <Button className="gap-2 mt-2" onClick={handlePickWinner} disabled={eligibleCount === 0}>
                        <Shuffle className="w-4 h-4" /> Pick Winner
                      </Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Participant list */}
            {participants.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Participants ({filtered.length}{allowDuplicates && participants.length !== filtered.length ? ` / ${participants.length} entries` : ""})</CardTitle>
                    <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => { setParticipants([]); setWinner(null); }}>
                      <RotateCcw className="w-3 h-3 mr-1" /> Clear all
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                    {filtered.map((p) => {
                      const isPastWinner = pastWinners.some((w) => w.id === p.id);
                      const isCurrentWinner = winner?.id === p.id;
                      const eng = platform.engagements.find((e) => e.id === p.engagementType);
                      const EngIcon = eng?.icon ?? Heart;
                      return (
                        <div
                          key={p.id}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm",
                            isCurrentWinner ? "bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800" : "hover:bg-muted/50",
                            isPastWinner && !isCurrentWinner && "opacity-50"
                          )}
                        >
                          {isCurrentWinner
                            ? <Trophy className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                            : isPastWinner
                            ? <Star className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            : <EngIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          }
                          <span className="flex-1 truncate font-medium">{p.name}</span>
                          {p.handle && <span className="text-xs text-muted-foreground truncate">{p.handle}</span>}
                          <button className="text-muted-foreground hover:text-destructive transition-colors shrink-0" onClick={() => setParticipants((prev) => prev.filter((x) => x.id !== p.id))}>
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Confirmation card for winner */}
            {winner && !picking && (
              <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/10">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">Winner confirmed</p>
                      <p className="text-xs text-muted-foreground">
                        {winner.name}{winner.handle ? ` (${winner.handle})` : ""} was randomly selected from {eligibleCount} eligible participant{eligibleCount !== 1 ? "s" : ""}.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
