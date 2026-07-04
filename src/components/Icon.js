/**
 * Central icon component (Notion style).
 *
 * One <Icon name="…" /> for the whole app: thin, rounded, monochrome. Defaults
 * to strokeWidth 1.75 + absoluteStrokeWidth and colors the glyph from the theme
 * token (tone: default=text, muted=textSecondary, brand=primary, inverse=white)
 * unless an explicit `color` is given.
 *
 * Back-compat: existing calls using `type="category|location|ui"` and the
 * getCategoryIcon/getLocationIcon/getUIIcon helpers keep working. Prefer the
 * semantic names in NAME_TO_COMPONENT (§4 of ICONOS_NOTION_HANDOFF) going forward.
 */
import React from "react";
import {
  // Categories
  PartyPopper,
  Dumbbell,
  UtensilsCrossed,
  Palette,
  BookOpen,
  Mountain,
  Music,
  Gamepad2,
  TreePine,
  Wine,
  PawPrint,
  Plane,
  Baby,
  // Semantic / UI
  Compass,
  Home,
  Calendar,
  Users,
  UsersRound,
  MessageSquare,
  MessageCircle,
  User,
  Search,
  SlidersHorizontal,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Check,
  Pencil,
  Share2,
  Trash2,
  Camera,
  Bell,
  Settings,
  MoreHorizontal,
  Heart,
  Star,
  Sparkles,
  BadgeCheck,
  Crown,
  CreditCard,
  QrCode,
  Megaphone,
  TrendingUp,
  Ticket,
  Lock,
  ShieldCheck,
  Eye,
  EyeOff,
  Flag,
  Ban,
  Clock,
  MapPin,
  Globe,
  Briefcase,
  Zap,
  Coffee,
  Gift,
  Tag,
  DollarSign,
  Repeat,
  Circle,
  Archive,
  BarChart3,
  Bike,
  Brain,
  CalendarCheck,
  CheckCheck,
  CheckCircle2,
  Image as ImageIcon,
  ImagePlus,
  Infinity as InfinityIcon,
  LogOut,
  Moon,
  Music2,
  RefreshCw,
  RotateCcw,
  Send,
  Sun,
  Tent,
  Wallet,
  Car,
  LayoutGrid,
} from "lucide-react-native";
import { useTheme } from "../contexts/ThemeContext";

// Category icon mapping (back-compat: type="category")
const CATEGORY_ICONS = {
  social: PartyPopper,
  sports: Dumbbell,
  food: UtensilsCrossed,
  arts: Palette,
  learning: BookOpen,
  adventure: Mountain,
  wellness: Heart,
  music: Music,
  games: Gamepad2,
  outdoors: TreePine,
  nightlife: Wine,
  networking: Briefcase,
  pets: PawPrint,
  travel: Plane,
  kids: Baby,
};

// Location icon mapping (back-compat: type="location")
const LOCATION_ICONS = {
  all: Globe,
  tulum: MapPin,
  "playa-del-carmen": MapPin,
  cancun: MapPin,
};

// UI icon mapping (back-compat: type="ui")
const UI_ICONS = {
  back: ChevronLeft,
  forward: ChevronRight,
  down: ChevronDown,
  up: ChevronUp,
  close: X,
  check: Check,
  plus: Plus,
  search: Search,
  filter: Filter,
  settings: Settings,
  calendar: Calendar,
  clock: Clock,
  location: MapPin,
  users: Users,
  user: User,
  home: Home,
  bell: Bell,
  message: MessageCircle,
  star: Star,
  tag: Tag,
  dollar: DollarSign,
  gift: Gift,
  repeat: Repeat,
  globe: Globe,
};

// Semantic name → component (§4). Single source for <Icon name="…" />.
const NAME_TO_COMPONENT = {
  ...UI_ICONS,
  filter: SlidersHorizontal,
  discover: Compass,
  events: Calendar,
  matching: Users,
  chat: MessageSquare,
  profile: User,
  add: Plus,
  edit: Pencil,
  share: Share2,
  delete: Trash2,
  camera: Camera,
  more: MoreHorizontal,
  heart: Heart,
  ai: Sparkles,
  community: UsersRound,
  verified: BadgeCheck,
  pro: Crown,
  payment: CreditCard,
  qr: QrCode,
  broadcast: Megaphone,
  analytics: TrendingUp,
  ticket: Ticket,
  lock: Lock,
  privacy: ShieldCheck,
  view: Eye,
  hide: EyeOff,
  report: Flag,
  block: Ban,
  languages: Globe,
  profession: Briefcase,
  energy: Zap,
  category: Coffee,
  hiking: Mountain,
  music: Music,
  // CategoryIcon taxonomy (so CategoryIcon can delegate to <Icon>)
  coffee: Coffee,
  outdoor: Mountain,
  food: UtensilsCrossed,
  sports: Dumbbell,
  art: Palette,
  games: Gamepad2,
  books: BookOpen,
  nightlife: PartyPopper,
  other: Sparkles,
  // Extended set (covers the remaining app-wide icons)
  archive: Archive,
  chart: BarChart3,
  bike: Bike,
  brain: Brain,
  calendarCheck: CalendarCheck,
  checkAll: CheckCheck,
  successCircle: CheckCircle2,
  image: ImageIcon,
  imagePlus: ImagePlus,
  infinity: InfinityIcon,
  logout: LogOut,
  moon: Moon,
  music2: Music2,
  playlist: Music2,
  refresh: RefreshCw,
  rotate: RotateCcw,
  send: Send,
  sun: Sun,
  tent: Tent,
  wallet: Wallet,
  fleet: Car,
  car: Car,
  wall: LayoutGrid,
};

/**
 * @param {string} name - semantic name (NAME_TO_COMPONENT) or, with `type`,
 *   a category/location/ui key.
 * @param {number} size - default 22 (§5 scale: 14–24).
 * @param {string} color - explicit color; overrides `tone`.
 * @param {string} tone - "default" | "muted" | "brand" | "inverse".
 * @param {number} strokeWidth - default 1.75 (Notion).
 * @param {string} type - back-compat: "category" | "location" | "ui".
 */
export default function Icon({
  name,
  size = 22,
  color,
  tone = "default",
  strokeWidth = 1.75,
  type,
  style,
  fill,
}) {
  const { colors } = useTheme();
  const key = name?.toLowerCase();

  let IconComponent;
  if (type === "category") IconComponent = CATEGORY_ICONS[key] || PartyPopper;
  else if (type === "location") IconComponent = LOCATION_ICONS[key] || MapPin;
  else IconComponent = NAME_TO_COMPONENT[key] || Circle;

  const toneColor =
    color ||
    (tone === "muted"
      ? colors.textSecondary
      : tone === "brand"
      ? colors.primary
      : tone === "inverse"
      ? "#FFFFFF"
      : colors.text);

  return (
    <IconComponent
      size={size}
      color={toneColor}
      strokeWidth={strokeWidth}
      absoluteStrokeWidth
      style={style}
      fill={fill ?? "none"}
    />
  );
}

// Back-compat getters (return the raw lucide component).
export const getCategoryIcon = (categoryId) =>
  CATEGORY_ICONS[categoryId?.toLowerCase()] || PartyPopper;

export const getLocationIcon = (locationId) =>
  LOCATION_ICONS[locationId?.toLowerCase()] || MapPin;

export const getUIIcon = (iconName) =>
  UI_ICONS[iconName?.toLowerCase()] || Star;

export { CATEGORY_ICONS, LOCATION_ICONS, UI_ICONS, NAME_TO_COMPONENT };
