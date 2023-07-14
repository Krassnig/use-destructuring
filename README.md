# useDestructuring

When calling `useDestructuring` matching setState function for each property in a Javascript object are created. The primary use case of `useDestructuring` is for handling forms in React. 

```tsx
import { useState } from "react";
import useDestructuring from "use-destructuring";

interface Person {
    firstName: string;
    lastName: string;
}

export const PersonForm: React.FC = () => {
    
    const [person, setPerson] = useState<Person>({ firstName: 'John', lastName: 'Smith' });

    const { firstName, lastName } = person; // Javascript object destructuring
    const { setFirstName, setLastName } = useDestructuring(person, setPerson);

    return (
        <form>
            <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} />
            <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} />
        </form>
    );
};
```

## Getting Started

First install `use-destructuring` using NPM

```
npm install use-destructuring
```

or if you are using Yarn

```
yarn add use-destructuring
```

then import it inside your React project

```tsx
import useDestructuring from "use-destructuring";
```

## Using Destructuring for Abstraction

`useDestructuring` allows you to abstract form components in multiple ways.

```tsx
import { useState } from "react";
import useDestructuring from "use-destructuring";

interface Person {
    firstName: string;
    lastName: string;
}

type Props = {
    person: Person;
    setPerson: React.Dispatch<React.SetStateAction<Person>>;
}

export const PersonForm: React.FC<Props> = ({ person, setPerson }) => {

    const { firstName, lastName } = person; // Javascript object destructuring
    const { setFirstName, setLastName } = useDestructuring(person, setPerson);

    return (
        <Form>
            <TextInput text={firstName} setText={setFirstName} />
            <TextInput text={lastName} setText={setLastName} />
        </Form>
    );
};

/*
type TextInputProps = {
    text: string,
    setText: React.Dispatch<React.SetStateAction<string>>
}
const TextInput: React.FC<TextInputProps> = () => { ... };
*/
```

The `PersonForm` itself can easily become a reusable component that lets you freely move the `Person` state among its parent components. At the same time, it allows the implementation of form fields that need not know about the structure of the `Person` object.

## Arrays

`useDestructuring` also supports destructuring of arrays. For example, our `Person` object from before might contain a list of telephone numbers. Simply extend the `PersonForm` like you would with any other property. In this case the list of phone numbers is handled in a separate component.

#### PersonForm.tsx
```tsx
interface Person {
    firstName: string;
    lastName: string;
    phoneNumbers: string[];
}

export const PersonForm: React.FC<Props> = ({ person, setPerson }) => {

    const { firstName, lastName, phoneNumbers } = person;
    const { setFirstName, setLastName, setPhoneNumbers } = useDestructuring(person, setPerson);

    return (
        <Form>
            <TextInput text={firstName} setText={setFirstName} />
            <TextInput text={lastName} setText={setLastName} />
            <PhoneNumbersInput phoneNumbers={phoneNumbers} setPhoneNumbers={setPhoneNumbers} />
        </Form>
    );
};
```

In the `PhoneNumbersInput` component call `useDestructuring` to get a list of tuples `destructuredPhoneNumbers` in which each tuple contains one entry of `[phoneNumber, setPhoneNumber, removePhoneNumber]`. The first value is just the value in the `phoneNumbers[i]` array itself, the second is a `SetState` function that overwrites that array value at index `i` and the third removes the element at position `i` from the array.

#### PhoneNumbersInput.tsx
```tsx
type Props = {
    phoneNumbers: string[];
    setPhoneNumbers: React.Dispatch<React.SetState<string[]>>;
}

export const PhoneNumbersInput: React.FC<Props> = ({ phoneNumbers, setPhoneNumbers }) => {

    const destructuredPhoneNumbers = useDestructuring(phoneNumbers, setPhoneNumbers);

    return (
        <fieldset>
            { destructuredPhoneNumbers.map(([phoneNumber, setPhoneNumber, removePhoneNumber]) => (
                <span key={phoneNumber}>
                    <TextInput text={phoneNumber} setPhoneNumber={setPhoneNumber} >
                    <button type="button" onClick={() => removePhoneNumber()}>X</button>
                </span>
            )) }
            <button type="button" onClick={
                () => setPhoneNumbers(oldPhoneNumbers => [...oldPhoneNumbers, '+01234567'])
            }>Add New Telephone Number</button>
        </fieldset>
    );
}
```

To add additional phone numbers to the list of existing phone numbers, you can just use the `setPhoneNumbers` function which is already present.

## Performance

Per default React will rerender the entire form and **ALL** its child components. To only rerender components which have their props changed React components can be wrapped in [React.memo](https://react.dev/reference/react/memo) calls. To support the usage of `React.memo`, `useDestructuring` saves all its produced setter functions so that they do not change from one rerender to the next, much like `useState` (but not exactly). That means that in the ideal scenario only the leaf component that is edited and all its parents up until the component that holds the form state are rerendered. Rerender count can be reduced further by implementing a debounce in leaf fields that do not immidiately call `setState` (e.g. waiting while typing).