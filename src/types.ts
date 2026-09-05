export interface FamilyMember {
  id: number;
  name: string;
  color: string | null;
  avatar: string | null;
  stars: number;
  phone: string | null;
  visible: boolean;
}

export interface Chore {
  id: number;
  title: string;
  time_of_day: "Morning" | "Evening";
  member_id: number;
  completed: boolean;
  member_name?: string;
}

export interface Meal {
  id: number;
  title: string;
  date: string;
  type: "Breakfast" | "Lunch" | "Dinner" | "Snack";
  color: string;
}

export interface Event {
  version?: number;
  id: number | string;
  title: string;
  start_date: string;
  end_date?: string;
  member_id?: number;
  member_ids?: number[];
  recurrence?: string;
  rrule?: string;
  is_external?: boolean;
  source_name?: string;
  source_id?: number;
  color?: string;
  description?: string;
  location?: string;
  is_all_day?: boolean;
}

export interface Photo {
  id: number;
  url: string;
  uploaded_at: string;
}

export interface List {
  id: number;
  title: string;
  icon: string;
}

export interface ListItem {
  id: number;
  list_id: number;
  text: string;
  completed: boolean;
}

export interface CalendarSubscription {
  id: number;
  name: string;
  url: string;
  color: string;
}

export interface CurrentWeather {
  temperature_2m: number;
  weather_code: number;
}
