import {
  Utensils, ShoppingCart, ShoppingBag, Car, Fuel, Home, Zap, Wifi, Smartphone, Shirt, Laptop,
  Pill, Dumbbell, Film, Tv, GraduationCap, Plane, Gift, TrendingUp, Coffee, Bus, Receipt,
  Wallet, Landmark, CreditCard, Banknote, PiggyBank, Briefcase, Stethoscope, BookOpen, Scissors,
  Baby, Heart, Users, Target, Repeat, Tag, Building2, Layers, Sparkles, Train, Bike, Ticket,
  Cigarette, Wine, Cat, Hammer, Umbrella, Wrench, Shield, Phone, Music, Camera, Palette,
  Handshake, HandCoins,
} from "lucide-react";
import React from "react";

/** Every icon a user can pick for a category, account or payment method. */
export const ICONS = {
  Utensils, ShoppingCart, ShoppingBag, Car, Fuel, Home, Zap, Wifi, Smartphone, Shirt, Laptop,
  Pill, Dumbbell, Film, Tv, GraduationCap, Plane, Gift, TrendingUp, Coffee, Bus, Receipt,
  Wallet, Landmark, CreditCard, Banknote, PiggyBank, Briefcase, Stethoscope, BookOpen, Scissors,
  Baby, Heart, Users, Target, Repeat, Tag, Building2, Layers, Sparkles, Train, Bike, Ticket,
  Cigarette, Wine, Cat, Hammer, Umbrella, Wrench, Shield, Phone, Music, Camera, Palette,
  Handshake, HandCoins,
};
export const ICON_NAMES = Object.keys(ICONS);

export function Ic({ n, size = 18, ...rest }) {
  const C = ICONS[n] || Tag;
  return <C size={size} {...rest} />;
}

/** Palette offered in every colour picker. */
export const SWATCHES = [
  "#C87A15", "#E0602C", "#CE3D57", "#C8459B", "#8A3FD1", "#6B4FD8", "#4A5BE8", "#2F7FE0",
  "#1FA0C8", "#3A8FA8", "#0E8A63", "#2E9E6B", "#7F9E1E", "#D9A21B", "#8B5E34", "#3C4A66",
];

export const ACCOUNT_TYPES = ["Bank", "Cash", "Credit Card", "Wallet", "Investment", "Loan", "Receivable"];

export const ACCOUNT_ICON = {
  Bank: "Landmark", Cash: "Banknote", "Credit Card": "CreditCard", Wallet: "Wallet",
  Investment: "TrendingUp", Loan: "Receipt", Receivable: "Users",
};
