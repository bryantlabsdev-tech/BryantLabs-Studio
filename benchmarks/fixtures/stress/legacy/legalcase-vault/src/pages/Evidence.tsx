import { useState } from "react";
import { FiFileText, FiCamera, FiVideo, FiMic, FiPlus } from "../components/IconStub";
// Assuming a more complete Evidence type from a full types.ts
type EvidenceType = "Document" | "Photo" | "Video" | "Audio Recording";
type EvidenceItem = {
  id: string;
  title: string;
  type: EvidenceType;
  caseName: string;
  collectedDate: string;
  description: string;
};

const mockEvidence: EvidenceItem[] = [
  { id: "ev-001", title: "Exhibit A: Security Footage", type: "Video", caseName: "Acme Corp v. Stark Inc.", collectedDate: "2023-10-15", description: "Shows defendant entering the premises at 10:05 PM." },
  { id: "ev-002", title: "Witness Statement - J. Doe", type: "Document", caseName: "State v. Miller", collectedDate: "2023-10-12", description: "Signed affidavit from the primary witness." },
  { id: "ev-003", title: "Crime Scene Photos (Set 1)", type: "Photo", caseName: "State v. Miller", collectedDate: "2023-09-28", description: "15 photos of the living room area." },
  { id: "ev-004", title: "Recorded Phone Call", type: "Audio Recording", caseName: "Acme Corp v. Stark Inc.", collectedDate: "2023-11-01", description: "Call between CEO and the plaintiff on Oct 5th." },
];

const evidenceTypeIcons: Record<EvidenceType, React.ElementType> = {
  "Document": FiFileText,
  "Photo": FiCamera,
  "Video": FiVideo,
  "Audio Recording": FiMic,
};

const Evidence = () => {
  const [evidenceItems, _setEvidenceItems] = useState<EvidenceItem[]>(mockEvidence);

  const EvidenceCard = ({ item }: { item: EvidenceItem }) => {
    const Icon = evidenceTypeIcons[item.type];
    return (
      <div className="panel-card flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="flex items-center gap-2 text-sm">
              <Icon className="h-4 w-4" />
              {item.type}
            </span>
            <span className="text-xs">{item.collectedDate}</span>
          </div>
          <h3 className="font-semibold text-lg text-gray-100 mb-1">{item.title}</h3>
          <p className="text-sm text-gray-300 line-clamp-3">{item.description}</p>
        </div>
        <div className="mt-4 text-xs text-blue-400 font-medium">
          Case: {item.caseName}
        </div>
      </div>
    );
  };

  return (
    <main className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-100">Evidence Log</h1>
        <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md transition-colors duration-200">
          <FiPlus />
          <span>Add Evidence</span>
        </button>
      </div>

      {evidenceItems.length === 0 ? (
        <div className="panel-card text-center py-12">
          <FiFileText className="mx-auto h-12 w-12 text-gray-500" />
          <h3 className="mt-2 text-lg font-medium text-gray-200">No Evidence Found</h3>
          <p className="mt-1 text-sm text-gray-400">Get started by adding your first piece of evidence.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {evidenceItems.map((item) => <EvidenceCard key={item.id} item={item} />)}
        </div>
      )}
    </main>
  );
};

export default Evidence;