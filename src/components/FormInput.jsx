import { useField } from 'formik'

/**
 * Formik entegreli form input bileşeni
 * Validation ve error handling ile birlikte gelir
 */
export default function FormInput({ label, ...props }) {
  // Formik field hook'u - validation ve state yönetimi için
  const [field, meta] = useField(props)

  return (
    <div className="space-y-2">
      {/* Label */}
      <label htmlFor={props.name} className="block text-sm font-semibold text-gray-700">
        {label}
      </label>
      
      <div className="relative">
        {/* Input field */}
        <input
          {...field}
          {...props}
          className={`block w-full px-4 py-3 border rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-0 ${
            meta.touched && meta.error
              ? 'border-red-300 focus:ring-red-500 focus:border-red-500 bg-red-50'
              : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 hover:border-gray-400 focus:bg-white'
          } placeholder-gray-400 text-gray-900 text-sm`}
        />
        
        {/* Error icon */}
        {meta.touched && meta.error && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
        )}
      </div>
      
      {/* Error message */}
      {meta.touched && meta.error && (
        <p className="text-sm text-red-600 flex items-center">
          <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
          {meta.error}
        </p>
      )}
    </div>
  )
}