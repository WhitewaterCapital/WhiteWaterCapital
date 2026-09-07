import WarMapLoader from './WarMapLoader';

export const metadata = {
  title: 'War Map — Whitewater',
  description: 'Live conflict-zone monitoring, threat tiers, and intel feed.',
};

export default function WarMapPage() {
  return <WarMapLoader />;
}
