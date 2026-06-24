import { VenueStatus } from "../types";

type Venue = {
  id: string;
  name: string;
  location: string;
  capacity: number;
  status: VenueStatus;
  price: number;
};

const mockVenues: Venue[] = [
  { id: '1', name: "Metro Convention Center", location: "Downtown", capacity: 5000, status: "Available", price: 15000 },
  { id: '2', name: "City Park Amphitheater", location: "City Park", capacity: 10000, status: "Booked", price: 20000 },
  { id: '3', name: "The Grand Ballroom", location: "Uptown", capacity: 500, status: "Pending", price: 8000 },
  { id: '4', name: "Innovation Hub", location: "Tech District", capacity: 200, status: "Available", price: 4500 },
  { id: '5', name: "Lakeside Resort", location: "Lakeview", capacity: 300, status: "Booked", price: 12000 },
];

const statusColors: Record<VenueStatus, string> = {
  Available: "bg-green-500/20 text-green-300",
  Booked: "bg-red-500/20 text-red-300",
  Pending: "bg-yellow-500/20 text-yellow-300",
};

const Venues = () => {
  const venues: Venue[] = mockVenues;

  return (
    <main className="p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Venues</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg">
          New Venue
        </button>
      </div>

      {venues.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {venues.map((venue) => (
            <div key={venue.id} className="panel-card flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start">
                  <h2 className="text-lg font-semibold text-white">{venue.name}</h2>
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[venue.status]}`}>
                    {venue.status}
                  </span>
                </div>
                <p className="text-sm text-gray-400 mt-1">{venue.location}</p>
              </div>
              <div className="mt-4 flex justify-between items-baseline">
                <p className="text-sm text-gray-300">Capacity: {venue.capacity.toLocaleString()}</p>
                <p className="text-lg font-bold text-white">
                  {venue.price.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                  <span className="text-sm font-normal text-gray-400">/day</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel-card text-center py-12">
            <h3 className="text-lg font-semibold">No Venues Found</h3>
            <p className="text-gray-400 mt-1">Get started by adding a new venue.</p>
        </div>
      )}
    </main>
  );
};

export default Venues;