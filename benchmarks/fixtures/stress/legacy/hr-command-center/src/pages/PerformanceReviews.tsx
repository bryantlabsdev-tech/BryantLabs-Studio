import { useState } from "react";
import type { PerformanceReviewStatus } from '../types';

interface PerformanceReview {
  id: string;
  employeeName: string;
  reviewerName: string;
  reviewDate: string;
  status: PerformanceReviewStatus;
}

const mockReviews: PerformanceReview[] = [
  { id: '1', employeeName: 'Alice Johnson', reviewerName: 'Admin User', reviewDate: '2023-11-15', status: 'Scheduled' },
  { id: '2', employeeName: 'Bob Smith', reviewerName: 'Admin User', reviewDate: '2023-11-18', status: 'Scheduled' },
  { id: '3', employeeName: 'Charlie Brown', reviewerName: 'Admin User', reviewDate: '2023-05-20', status: 'Completed' },
  { id: '4', employeeName: 'Diana Prince', reviewerName: 'Admin User', reviewDate: '2023-06-01', status: 'Completed' },
];

const StatusBadge = ({ status }: { status: PerformanceReviewStatus }) => {
  const statusClasses: Record<PerformanceReviewStatus, string> = {
    Scheduled: 'bg-blue-600 text-blue-100',
    Completed: 'bg-green-600 text-green-100',
  };
  return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusClasses[status]}`}>{status}</span>;
};

export default function PerformanceReviews() {
  const [reviews, setReviews] = useState(mockReviews);

  const handleDeleteReview = (id: string) => {
    setReviews(current => current.filter(review => review.id !== id));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Performance Reviews</h2>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md">
          Schedule Review
        </button>
      </div>

      <div className="panel-card bg-gray-800 rounded-lg shadow-md overflow-hidden">
        {reviews.length > 0 ? (
          <table className="w-full text-left">
            <thead className="bg-gray-700/50">
              <tr>
                <th className="p-4 text-sm font-semibold">Employee</th>
                <th className="p-4 text-sm font-semibold">Reviewer</th>
                <th className="p-4 text-sm font-semibold">Review Date</th>
                <th className="p-4 text-sm font-semibold">Status</th>
                <th className="p-4 text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {reviews.map((review) => (
                <tr key={review.id} className="hover:bg-gray-700/50">
                  <td className="p-4">{review.employeeName}</td>
                  <td className="p-4">{review.reviewerName}</td>
                  <td className="p-4">{review.reviewDate}</td>
                  <td className="p-4"><StatusBadge status={review.status} /></td>
                  <td className="p-4 space-x-4">
                    <button className="text-indigo-400 hover:text-indigo-300">View</button>
                    <button onClick={() => handleDeleteReview(review.id)} className="text-gray-400 hover:text-white">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center p-12">
            <h3 className="text-lg font-medium">No Performance Reviews</h3>
            <p className="text-gray-400 mt-2">Schedule a new review to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}