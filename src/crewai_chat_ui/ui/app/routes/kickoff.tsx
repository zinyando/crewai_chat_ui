import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';
import { Label } from '~/components/ui/label';
import { Textarea } from '~/components/ui/textarea';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useChatStore } from '~/lib/store';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert';

export function meta() {
  return [
    { title: "CrewAI - Kickoff Mode" },
    { name: "description", content: "Run a crew directly with specific inputs" },
  ];
}

interface InputField {
  name: string;
  description: string;
  value: string;
}

interface CrewDetails {
  id: string;
  name: string;
  description: string;
  required_inputs: InputField[];
}

export default function Kickoff() {
  const navigate = useNavigate();
  const { crews, setCrews, isDarkMode } = useChatStore();
  const [selectedCrewId, setSelectedCrewId] = useState<string>('');
  const [crewDetails, setCrewDetails] = useState<CrewDetails | null>(null);
  const [inputFields, setInputFields] = useState<InputField[]>([]);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch available crews on component mount
  useEffect(() => {
    const fetchCrews = async () => {
      try {
        const response = await fetch('/api/crews');
        const data = await response.json();
        
        if (data.status === 'success' && Array.isArray(data.crews)) {
          setCrews(data.crews);
        }
      } catch (error) {
        console.error('Error fetching crews:', error);
        setError('Failed to fetch available crews. Please try again later.');
      } finally {
        setInitializing(false);
      }
    };

    fetchCrews();
  }, [setCrews]);

  // Fetch crew details when a crew is selected
  useEffect(() => {
    if (!selectedCrewId) return;

    const fetchCrewDetails = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/initialize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ crew_id: selectedCrewId }),
        });
        
        const data = await response.json();
        
        if (data.status === 'success') {
          const details: CrewDetails = {
            id: data.crew_id,
            name: data.crew_name,
            description: data.crew_description || 'No description available',
            required_inputs: [],
          };
          
          // Initialize input fields from required inputs
          const inputs = data.required_inputs || [];
          const fields = inputs.map((input: any) => ({
            name: input.name,
            description: input.description || '',
            value: '',
          }));
          
          setCrewDetails(details);
          setInputFields(fields);
        } else {
          setError(data.error || 'Failed to fetch crew details');
        }
      } catch (error) {
        console.error('Error fetching crew details:', error);
        setError('Failed to fetch crew details. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    fetchCrewDetails();
  }, [selectedCrewId]);

  const handleInputChange = (name: string, value: string) => {
    setInputFields(fields => 
      fields.map(field => 
        field.name === name ? { ...field, value } : field
      )
    );
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedCrewId) return;
    
    setLoading(true);
    setError(null);
    setResult(null);
    
    // Convert input fields to the expected format
    const inputs: Record<string, string> = {};
    inputFields.forEach(field => {
      inputs[field.name] = field.value;
    });
    
    try {
      const response = await fetch(`/api/crews/${selectedCrewId}/kickoff`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inputs }),
      });
      
      const data = await response.json();
      
      if (data.status === 'success') {
        setResult(data.result);
      } else {
        setError(data.detail || 'Failed to run crew');
      }
    } catch (error) {
      console.error('Error running crew:', error);
      setError('Failed to run crew. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    navigate('/');
  };

  return (
    <div className={`min-h-screen flex flex-col ${isDarkMode ? 'dark bg-gray-900 text-white' : 'bg-gray-50 text-gray-900'}`}>
      {/* Header */}
      <header className="py-4 px-8 border-b">
        <div className="container mx-auto flex items-center">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleBack}
            className="mr-4"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">CrewAI Kickoff</h1>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-grow container mx-auto px-4 py-8">
        {initializing ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            <div className="mb-8">
              <h2 className="text-3xl font-bold mb-2">Run a Crew Directly</h2>
              <p className="text-gray-500 dark:text-gray-400">
                Select a crew and provide the required inputs to run it directly.
              </p>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-6">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="crew-select">Select a Crew</Label>
                <Select
                  value={selectedCrewId}
                  onValueChange={setSelectedCrewId}
                  disabled={loading}
                >
                  <SelectTrigger id="crew-select" className="w-full">
                    <SelectValue placeholder="Select a crew" />
                  </SelectTrigger>
                  <SelectContent>
                    {crews.map((crew) => (
                      <SelectItem key={crew.id} value={crew.id}>
                        {crew.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {crewDetails && (
                <div className={`p-4 rounded-lg ${isDarkMode ? 'bg-gray-800' : 'bg-white'} border`}>
                  <h3 className="text-xl font-semibold mb-2">{crewDetails.name}</h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-4">{crewDetails.description}</p>
                </div>
              )}

              {inputFields.length > 0 && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Required Inputs</h3>
                  
                  {inputFields.map((field) => (
                    <div key={field.name} className="space-y-2">
                      <Label htmlFor={field.name}>
                        {field.name}
                        {field.description && (
                          <span className="text-sm text-gray-500 dark:text-gray-400 block">
                            {field.description}
                          </span>
                        )}
                      </Label>
                      {field.description.toLowerCase().includes('longer') ? (
                        <Textarea
                          id={field.name}
                          value={field.value}
                          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleInputChange(field.name, e.target.value)}
                          disabled={loading}
                          className="min-h-32"
                        />
                      ) : (
                        <Input
                          id={field.name}
                          value={field.value}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleInputChange(field.name, e.target.value)}
                          disabled={loading}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}

              {selectedCrewId && (
                <Button 
                  type="submit" 
                  className="w-full" 
                  size="lg"
                  disabled={loading || inputFields.some(field => !field.value)}
                >
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Running Crew...
                    </>
                  ) : (
                    'Run Crew'
                  )}
                </Button>
              )}
            </form>

            {result && (
              <div className="mt-8">
                <h3 className="text-xl font-bold mb-4">Result</h3>
                <div className={`p-6 rounded-lg border ${isDarkMode ? 'bg-gray-800' : 'bg-white'}`}>
                  <pre className="whitespace-pre-wrap">{result}</pre>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className={`py-4 px-8 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="container mx-auto text-center">
          <p className="text-sm text-gray-500">
            CrewAI Chat UI - Powered by CrewAI
          </p>
        </div>
      </footer>
    </div>
  );
}
